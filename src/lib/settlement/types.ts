/**
 * Canonical settlement domain types.
 *
 * All monetary values are integer CENTS. No floating point anywhere in the
 * calculation engine. Manual entry, and later OCR / other input channels, all
 * produce this same canonical Bill shape.
 */

export type Participant = {
  id: string;
  name: string;
  /** Deterministic tie-breaker: order the participant was added. */
  order: number;
};

export type BillItem = {
  id: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  /** Participants sharing this item equally. Empty = unassigned. */
  ownerIds: string[];
};

export type Bill = {
  id: string;
  merchant: string;
  /** Participant id of whoever actually paid. */
  payerId: string | null;
  items: BillItem[];
  /** Only ever what the user explicitly entered. 0 = none. */
  serviceChargeCents: number;
  gstCents: number;
  /** The total printed on the bill. */
  totalCents: number;
};

export type Session = {
  participants: Participant[];
  bills: Bill[];
};

/* ---------------------------------------------------------------- results */

export type ItemLine = {
  itemId: string;
  itemName: string;
  /** Full line amount for the item (qty x unit price). */
  lineTotalCents: number;
  /** How many people shared it. */
  sharedWays: number;
  /** This participant's portion of the line. */
  shareCents: number;
};

export type ParticipantBillBreakdown = {
  participantId: string;
  items: ItemLine[];
  subtotalCents: number;
  serviceChargeCents: number;
  gstCents: number;
  /** Residual cents absorbed by this participant (usually 0). */
  roundingCents: number;
  totalCents: number;
};

export type BillResult = {
  billId: string;
  breakdowns: ParticipantBillBreakdown[];
  itemsSubtotalCents: number;
  serviceChargeCents: number;
  gstCents: number;
  /** items + service charge + GST, as calculated. */
  calculatedTotalCents: number;
  /** The total the user says is printed on the bill. */
  billTotalCents: number;
  reconciles: boolean;
  /** calculated - printed. Positive = we calculated more than the bill says. */
  differenceCents: number;
  unassignedItems: { itemId: string; itemName: string }[];
};

export type NetBalance = {
  participantId: string;
  paidCents: number;
  shareCents: number;
  /** paid - share. Positive = should receive money. */
  netCents: number;
};

export type Transfer = {
  fromId: string;
  toId: string;
  amountCents: number;
};

export type SessionResult = {
  billResults: BillResult[];
  balances: NetBalance[];
  transfers: Transfer[];
  /** True when every bill reconciles and every item is assigned. */
  ready: boolean;
  grandTotalCents: number;
};
