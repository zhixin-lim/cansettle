/**
 * Settlement session state, backed by the CanSettle backend.
 *
 * The backend owns sessions, participants, bills, items and allocations (all
 * ids are backend UUIDs). The device keeps only: the current session id (to
 * reopen it), optional PayNow numbers and merchant names (never sent), and
 * bills still being typed in (in memory until "Done with this bill").
 * No user-entered data is ever logged.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { api, ApiError, type ApiAllocation, type ApiSession } from "./api";
import type { Bill, BillItem, Participant, Session } from "./settlement";
import { SessionContext, type SessionContextValue } from "./session-context";

const DEVICE_KEY = "cansettle.device.v1";
const LEGACY_KEY = "settle-makan.session.v1";

export const emptySession: Session = { participants: [], bills: [] };

type DeviceNotes = {
  sessionId: string | null;
  phones: Record<string, string>;
  merchants: Record<string, string>;
};
const emptyNotes: DeviceNotes = { sessionId: null, phones: {}, merchants: {} };

function readNotes(): DeviceNotes {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
    const raw = window.localStorage.getItem(DEVICE_KEY);
    if (!raw) return { ...emptyNotes };
    const p = JSON.parse(raw) as Partial<DeviceNotes>;
    return {
      sessionId: typeof p.sessionId === "string" ? p.sessionId : null,
      phones: p.phones ?? {},
      merchants: p.merchants ?? {},
    };
  } catch {
    return { ...emptyNotes };
  }
}
function writeNotes(n: DeviceNotes) {
  try {
    if (!n.sessionId) window.localStorage.removeItem(DEVICE_KEY);
    else window.localStorage.setItem(DEVICE_KEY, JSON.stringify(n));
  } catch {
    /* storage unavailable */
  }
}

let draftCounter = 0;
const DRAFT = "draft_";
function draftId(prefix: string) {
  draftCounter += 1;
  return `${DRAFT}${prefix}_${Date.now().toString(36)}${draftCounter}`;
}
const isDraft = (id: string) => id.startsWith(DRAFT);

export function makeBill(): Bill {
  return {
    id: draftId("bill"),
    merchant: "",
    payerId: null,
    items: [],
    serviceChargeCents: 0,
    gstCents: 0,
    totalCents: 0,
  };
}

/** Local-only id for an item row while its bill is being typed in. */
export function makeItem(): BillItem {
  return { id: draftId("item"), name: "", qty: 1, unitPriceCents: 0, ownerIds: [] };
}

export type SessionAction =
  | { type: "hydrate"; session: Session }
  | { type: "reset" }
  | { type: "renameParticipant"; id: string; name: string }
  | { type: "setParticipantPhone"; id: string; phone: string }
  | { type: "removeParticipant"; id: string }
  | { type: "addBill"; bill: Bill }
  | { type: "updateBill"; id: string; patch: Partial<Omit<Bill, "id" | "items">> }
  | { type: "removeBill"; id: string }
  | { type: "addItem"; billId: string; item: BillItem }
  | { type: "updateItem"; billId: string; itemId: string; patch: Partial<BillItem> }
  | { type: "removeItem"; billId: string; itemId: string }
  | { type: "toggleOwner"; billId: string; itemId: string; participantId: string }
  | { type: "setOwners"; billId: string; itemId: string; participantIds: string[] };

function mapBill(session: Session, billId: string, fn: (bill: Bill) => Bill): Session {
  return { ...session, bills: session.bills.map((b) => (b.id === billId ? fn(b) : b)) };
}
function mapItem(session: Session, billId: string, itemId: string, fn: (i: BillItem) => BillItem) {
  return mapBill(session, billId, (bill) => ({
    ...bill,
    items: bill.items.map((i) => (i.id === itemId ? fn(i) : i)),
  }));
}

export function sessionReducer(session: Session, action: SessionAction): Session {
  switch (action.type) {
    case "hydrate":
      return action.session;
    case "reset":
      return emptySession;
    case "setParticipantPhone":
      return {
        ...session,
        participants: session.participants.map((p) =>
          p.id === action.id ? { ...p, phone: action.phone.replace(/[^\d+ ]/g, "").slice(0, 16) } : p,
        ),
      };
    case "renameParticipant":
      return {
        ...session,
        participants: session.participants.map((p) =>
          p.id === action.id ? { ...p, name: action.name.slice(0, 40) } : p,
        ),
      };
    case "removeParticipant":
      return {
        participants: session.participants
          .filter((p) => p.id !== action.id)
          .map((p, i) => ({ ...p, order: i })),
        bills: session.bills.map((bill) => ({
          ...bill,
          payerId: bill.payerId === action.id ? null : bill.payerId,
          items: bill.items.map((item) => ({
            ...item,
            ownerIds: item.ownerIds.filter((id) => id !== action.id),
            ownerQuantities:
              item.ownerQuantities === undefined
                ? undefined
                : Object.fromEntries(
                    Object.entries(item.ownerQuantities).filter(([id]) => id !== action.id),
                  ),
          })),
        })),
      };
    case "addBill":
      return { ...session, bills: [...session.bills, action.bill] };
    case "updateBill":
      return mapBill(session, action.id, (bill) => ({ ...bill, ...action.patch }));
    case "removeBill":
      return { ...session, bills: session.bills.filter((b) => b.id !== action.id) };
    case "addItem":
      return mapBill(session, action.billId, (bill) => ({ ...bill, items: [...bill.items, action.item] }));
    case "updateItem":
      return mapItem(session, action.billId, action.itemId, (item) => ({ ...item, ...action.patch }));
    case "removeItem":
      return mapBill(session, action.billId, (bill) => ({
        ...bill,
        items: bill.items.filter((i) => i.id !== action.itemId),
      }));
    case "toggleOwner":
      return mapItem(session, action.billId, action.itemId, (item) => ({
        ...item,
        ownerIds: item.ownerIds.includes(action.participantId)
          ? item.ownerIds.filter((id) => id !== action.participantId)
          : [...item.ownerIds, action.participantId],
      }));
    case "setOwners":
      return mapItem(session, action.billId, action.itemId, (item) => ({
        ...item,
        ownerIds: action.participantIds,
      }));
    default:
      return session;
  }
}

/* ------------------------------------------------------------ mapping */

function fromApi(s: ApiSession, notes: DeviceNotes): Session {
  const participants: Participant[] = s.participants.map((p, i) => ({
    id: p.id,
    name: p.name,
    order: i,
    ...(notes.phones[p.id] ? { phone: notes.phones[p.id] } : {}),
  }));
  const bills: Bill[] = s.bills.map((b) => ({
    id: b.id,
    merchant: notes.merchants[b.id] ?? "",
    payerId: b.payerId,
    serviceChargeCents: b.serviceChargeCents,
    gstCents: b.gstCents,
    totalCents: b.totalCents,
    items: b.items.map((it) => {
      const qty = it.quantity && it.quantity > 0 ? it.quantity : 1;
      const unit = it.unitPriceCents ?? Math.round(it.totalCents / qty);
      const byQty = it.allocations.some((a) => (a.quantity ?? 1) !== 1);
      return {
        id: it.id,
        name: it.name,
        qty,
        unitPriceCents: unit,
        ownerIds: it.allocations.map((a) => a.participantId),
        ownerQuantities: byQty
          ? Object.fromEntries(it.allocations.map((a) => [a.participantId, a.quantity ?? 1]))
          : undefined,
      };
    }),
  }));
  return { participants, bills };
}

function allocationOf(item: BillItem): ApiAllocation[] {
  if (item.ownerQuantities) {
    return Object.entries(item.ownerQuantities)
      .filter(([, q]) => Number.isInteger(q) && q > 0)
      .map(([participantId, quantity]) => ({ participantId, quantity }));
  }
  return item.ownerIds.map((participantId) => ({ participantId, quantity: 1 }));
}

const ALLOCATION_KEYS = new Set(["ownerIds", "ownerQuantities"]);

function showError(e: unknown) {
  toast.error(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
}

/* ------------------------------------------------------------ provider */

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(emptySession);
  const [hydrated, setHydrated] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<string[]>([]);

  const sessionRef = useRef(session);
  const unsavedRef = useRef(unsaved);
  const notesRef = useRef<DeviceNotes>({ ...emptyNotes });

  const commit = useCallback((next: Session) => {
    sessionRef.current = next;
    setSession(next);
  }, []);
  const setUnsavedIds = useCallback((ids: string[]) => {
    unsavedRef.current = ids;
    setUnsaved(ids);
  }, []);
  const saveNotes = useCallback((patch: Partial<DeviceNotes>) => {
    notesRef.current = { ...notesRef.current, ...patch };
    writeNotes(notesRef.current);
    if (patch.sessionId !== undefined) setSessionId(patch.sessionId);
  }, []);

  /** Load from the backend, keeping bills that are still being edited here. */
  const loadFromServer = useCallback(
    async (sid: string) => {
      const remote = fromApi(await api.getSession(sid), notesRef.current);
      const local = sessionRef.current;
      const keep = new Set(unsavedRef.current);
      const bills = remote.bills.map((b) =>
        keep.has(b.id) ? (local.bills.find((x) => x.id === b.id) ?? b) : b,
      );
      for (const b of local.bills) if (isDraft(b.id)) bills.push(b);
      commit({ participants: remote.participants, bills });
      setUnsavedIds(unsavedRef.current.filter((id) => bills.some((b) => b.id === id)));
    },
    [commit, setUnsavedIds],
  );

  useEffect(() => {
    const notes = readNotes();
    notesRef.current = notes;
    setSessionId(notes.sessionId);
    if (!notes.sessionId) {
      setHydrated(true);
      return;
    }
    loadFromServer(notes.sessionId)
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 404 || e.status === 410)) {
          saveNotes({ ...emptyNotes });
          toast("That settlement has expired — starting fresh.");
        } else showError(e);
      })
      .finally(() => setHydrated(true));
  }, [loadFromServer, saveNotes]);

  const ensureSession = useCallback(async () => {
    if (notesRef.current.sessionId) return notesRef.current.sessionId;
    const created = await api.createSession();
    saveNotes({ sessionId: created.id });
    return created.id;
  }, [saveNotes]);

  const markUnsaved = useCallback(
    (billId: string) => {
      if (!unsavedRef.current.includes(billId)) setUnsavedIds([...unsavedRef.current, billId]);
    },
    [setUnsavedIds],
  );

  const dispatch = useCallback(
    (action: SessionAction) => {
      const next = sessionReducer(sessionRef.current, action);
      commit(next);

      const billId =
        action.type === "updateBill" ? action.id : "billId" in action ? action.billId : null;
      if (!billId || action.type === "addBill" || action.type === "removeBill") return;

      if (action.type === "updateBill") {
        const keys = Object.keys(action.patch);
        if (keys.length === 1 && keys[0] === "merchant") {
          if (!isDraft(billId)) {
            saveNotes({
              merchants: { ...notesRef.current.merchants, [billId]: action.patch.merchant ?? "" },
            });
          }
          return;
        }
      }

      const allocationOnly =
        action.type === "toggleOwner" ||
        action.type === "setOwners" ||
        (action.type === "updateItem" &&
          Object.keys(action.patch).every((k) => ALLOCATION_KEYS.has(k)));

      const sid = notesRef.current.sessionId;
      if (allocationOnly && sid && !isDraft(billId) && !unsavedRef.current.includes(billId)) {
        const item = next.bills
          .find((b) => b.id === billId)
          ?.items.find((i) => i.id === (action as { itemId: string }).itemId);
        if (item) api.setAllocation(sid, item.id, allocationOf(item)).catch(showError);
        return;
      }
      markUnsaved(billId);
    },
    [commit, markUnsaved, saveNotes],
  );

  const actions = useMemo<SessionContextValue["actions"]>(
    () => ({
      addParticipant: async (name) => {
        const clean = name.trim().slice(0, 40);
        if (!clean) return;
        try {
          const sid = await ensureSession();
          await api.addParticipant(sid, clean);
          await loadFromServer(sid);
        } catch (e) {
          showError(e);
        }
      },
      commitRename: async (pid) => {
        const sid = notesRef.current.sessionId;
        const p = sessionRef.current.participants.find((x) => x.id === pid);
        if (!sid || !p) return;
        try {
          if (p.name.trim()) await api.renameParticipant(sid, pid, p.name.trim());
          await loadFromServer(sid);
        } catch (e) {
          showError(e);
        }
      },
      removeParticipant: async (pid) => {
        const sid = notesRef.current.sessionId;
        if (!sid) return;
        try {
          await api.removeParticipant(sid, pid);
          await loadFromServer(sid);
          // Also strip them from bills still being typed in on this device.
          commit(sessionReducer(sessionRef.current, { type: "removeParticipant", id: pid }));
          const { [pid]: _gone, ...phones } = notesRef.current.phones;
          saveNotes({ phones });
        } catch (e) {
          showError(e);
        }
      },
      setPhone: (pid, phone) => {
        const next = sessionReducer(sessionRef.current, { type: "setParticipantPhone", id: pid, phone });
        commit(next);
        const clean = next.participants.find((p) => p.id === pid)?.phone ?? "";
        saveNotes({ phones: { ...notesRef.current.phones, [pid]: clean } });
      },
      newDraftBill: () => {
        const bill = makeBill();
        commit(sessionReducer(sessionRef.current, { type: "addBill", bill }));
        setUnsavedIds([...unsavedRef.current, bill.id]);
        return bill.id;
      },
      saveBill: async (billId) => {
        const bill = sessionRef.current.bills.find((b) => b.id === billId);
        if (!bill || !bill.payerId) throw new Error("Bill not ready");
        const sid = await ensureSession();
        const created = await api.createBill(sid, {
          payerId: bill.payerId,
          serviceChargeCents: bill.serviceChargeCents,
          gstCents: bill.gstCents,
          totalCents: bill.totalCents,
          items: bill.items.map((it) => ({
            name: it.name.trim(),
            quantity: it.qty,
            unitPriceCents: it.unitPriceCents,
            totalCents: it.qty * it.unitPriceCents,
          })),
        });
        await Promise.all(
          bill.items.map((it, i) => {
            const remote = created.items[i];
            const alloc = allocationOf(it);
            return remote && alloc.length ? api.setAllocation(sid, remote.id, alloc) : null;
          }),
        );
        // Replace the old saved version only after the new one is in.
        if (!isDraft(billId)) await api.removeBill(sid, billId).catch(() => undefined);
        const { [billId]: _old, ...merchants } = notesRef.current.merchants;
        saveNotes({ merchants: { ...merchants, [created.id]: bill.merchant } });
        commit({ ...sessionRef.current, bills: sessionRef.current.bills.filter((b) => b.id !== billId) });
        setUnsavedIds(unsavedRef.current.filter((id) => id !== billId));
        await loadFromServer(sid);
        return created.id;
      },
      removeBill: async (billId) => {
        const sid = notesRef.current.sessionId;
        try {
          if (!isDraft(billId) && sid) await api.removeBill(sid, billId);
          commit(sessionReducer(sessionRef.current, { type: "removeBill", id: billId }));
          setUnsavedIds(unsavedRef.current.filter((id) => id !== billId));
        } catch (e) {
          showError(e);
        }
      },
      refresh: async () => {
        const sid = notesRef.current.sessionId;
        if (sid) await loadFromServer(sid).catch(showError);
      },
      startOver: () => {
        saveNotes({ ...emptyNotes });
        commit(emptySession);
        setUnsavedIds([]);
      },
    }),
    [commit, ensureSession, loadFromServer, saveNotes, setUnsavedIds],
  );

  const value = useMemo(
    () => ({ session, dispatch, hydrated, sessionId, unsavedBillIds: unsaved, actions }),
    [session, dispatch, hydrated, sessionId, unsaved, actions],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
