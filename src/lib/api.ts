/**
 * Thin client for the CanSettle backend. All money is integer cents.
 * No user-entered data is ever logged here.
 */
export const API_BASE = "https://cansettle-backend-production.up.railway.app";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * The session provider registers here so that ANY request that finds the
 * settlement gone (expired = 410, or unknown = 404 "Session not found") can
 * trigger the same friendly "this settlement has expired" prompt.
 */
let sessionGoneListener: (() => void) | null = null;
export function onSessionGone(listener: (() => void) | null) {
  sessionGoneListener = listener;
}
export const SESSION_EXPIRED = "SESSION_EXPIRED";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string };
    const gone = res.status === 410 || (res.status === 404 && d.error === "Session not found");
    if (gone) {
      sessionGoneListener?.();
      throw new ApiError("This settlement has expired.", res.status, SESSION_EXPIRED);
    }
    throw new ApiError(d.error ?? `Something went wrong (${res.status}).`, res.status, d.code);
  }
  return data as T;
}

export type ApiParticipant = { id: string; name: string; createdAt: string };
export type ApiAllocation = { participantId: string; quantity: number };
export type ApiItem = {
  id: string;
  name: string;
  quantity: number | null;
  unitPriceCents: number | null;
  totalCents: number;
  allocations: ApiAllocation[];
};
export type ApiBill = {
  id: string;
  /** Optional shop name. Null on bills saved before the backend stored names. */
  name?: string | null;
  payerId: string;
  serviceChargeCents: number;
  gstCents: number;
  totalCents: number;
  createdAt: string;
  items: ApiItem[];
};
export type ApiSessionMeta = { id: string; label: string | null; createdAt: string; expiresAt: string };
export type ApiSession = ApiSessionMeta & { participants: ApiParticipant[]; bills: ApiBill[] };

export type ApiBillShare = {
  participantId: string;
  itemCents: number;
  serviceChargeCents: number;
  gstCents: number;
  totalCents: number;
};
export type ApiSettlement =
  | {
      ok: false;
      reason: string;
      unassignedItems?: { billId: string; itemId: string; name: string }[];
    }
  | {
      ok: true;
      balances: { participantId: string; paidCents: number; shareCents: number; netCents: number }[];
      transfers: { from: string; to: string; amountCents: number }[];
      billResults: {
        billId: string;
        shares: ApiBillShare[];
        itemSubtotalCents: number;
        reconciledTotalCents: number;
        expectedTotalCents: number;
        reconciled: boolean;
      }[];
    };

const s = (id: string) => `/sessions/${encodeURIComponent(id)}`;

export const api = {
  createSession: (label?: string) => request<ApiSessionMeta>("POST", "/sessions", label ? { label } : {}),
  getSession: (id: string) => request<ApiSession>("GET", s(id)),
  addParticipant: (sid: string, name: string) =>
    request<ApiParticipant>("POST", `${s(sid)}/participants`, { name }),
  renameParticipant: (sid: string, pid: string, name: string) =>
    request<ApiParticipant>("PATCH", `${s(sid)}/participants/${encodeURIComponent(pid)}`, { name }),
  removeParticipant: (sid: string, pid: string) =>
    request<unknown>("DELETE", `${s(sid)}/participants/${encodeURIComponent(pid)}`),
  createBill: (
    sid: string,
    bill: {
      name?: string;
      payerId: string;
      serviceChargeCents: number;
      gstCents: number;
      totalCents: number;
      items: { name: string; totalCents: number; quantity: number; unitPriceCents: number }[];
    },
  ) => request<ApiBill>("POST", `${s(sid)}/bills`, { source: "manual", ...bill }),
  removeBill: (sid: string, bid: string) =>
    request<unknown>("DELETE", `${s(sid)}/bills/${encodeURIComponent(bid)}`),
  setAllocation: (sid: string, itemId: string, allocations: ApiAllocation[]) =>
    request<ApiItem>("PATCH", `${s(sid)}/items/${encodeURIComponent(itemId)}/allocation`, {
      allocations,
    }),
  getSettlement: (sid: string) => request<ApiSettlement>("GET", `${s(sid)}/settlement`),
};
