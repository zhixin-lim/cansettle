/**
 * Settlement session state.
 *
 * Entirely client-side: one localStorage key, hydrated after mount so SSR and
 * the first client render match. Nothing is transmitted anywhere, and no
 * user-entered names or amounts are ever logged.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";

import type { Bill, BillItem, Participant, Session } from "./settlement";

const STORAGE_KEY = "settle-makan.session.v1";

export const emptySession: Session = { participants: [], bills: [] };

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeBill(): Bill {
  return {
    id: newId("bill"),
    merchant: "",
    payerId: null,
    items: [],
    serviceChargeCents: 0,
    gstCents: 0,
    totalCents: 0,
  };
}

export function makeItem(): BillItem {
  return { id: newId("item"), name: "", qty: 1, unitPriceCents: 0, ownerIds: [] };
}

type Action =
  | { type: "hydrate"; session: Session }
  | { type: "reset" }
  | { type: "addParticipant"; name: string }
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
  return {
    ...session,
    bills: session.bills.map((b) => (b.id === billId ? fn(b) : b)),
  };
}

function mapItem(
  session: Session,
  billId: string,
  itemId: string,
  fn: (item: BillItem) => BillItem,
): Session {
  return mapBill(session, billId, (bill) => ({
    ...bill,
    items: bill.items.map((i) => (i.id === itemId ? fn(i) : i)),
  }));
}

export function sessionReducer(session: Session, action: Action): Session {
  switch (action.type) {
    case "hydrate":
      return action.session;
    case "reset":
      return emptySession;

    case "addParticipant": {
      const name = action.name.trim().slice(0, 40);
      if (!name) return session;
      const participant: Participant = {
        id: newId("p"),
        name,
        order: session.participants.length,
      };
      return { ...session, participants: [...session.participants, participant] };
    }

    case "setParticipantPhone":
      return {
        ...session,
        participants: session.participants.map((p) =>
          p.id === action.id
            ? { ...p, phone: action.phone.replace(/[^\d+ ]/g, "").slice(0, 16) }
            : p,
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
      return mapBill(session, action.billId, (bill) => ({
        ...bill,
        items: [...bill.items, action.item],
      }));

    case "updateItem":
      return mapItem(session, action.billId, action.itemId, (item) => ({
        ...item,
        ...action.patch,
      }));

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

type SessionContextValue = {
  session: Session;
  dispatch: (action: Action) => void;
  /** False until localStorage has been read on the client. */
  hydrated: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function readStored(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!Array.isArray(parsed?.participants) || !Array.isArray(parsed?.bills)) {
      return null;
    }
    return parsed;
  } catch {
    // Corrupt or unavailable storage: start clean, without logging contents.
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(sessionReducer, emptySession);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored) dispatch({ type: "hydrate", session: stored });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (session.participants.length === 0 && session.bills.length === 0) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      }
    } catch {
      // Storage unavailable (private mode / quota): the session stays in memory.
    }
  }, [session, hydrated]);

  const value = useMemo(() => ({ session, dispatch, hydrated }), [session, hydrated]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export function clearStoredSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
