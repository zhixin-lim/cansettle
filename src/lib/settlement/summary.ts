import type { ApiSettlement } from "../api";
import { calculateBill } from "./engine";
import { formatCents } from "./money";
import type { ItemLine, Session } from "./types";

export type OkSettlement = Extract<ApiSettlement, { ok: true }>;

/**
 * Item lines for one person on one bill, for display only. Money totals come
 * from the backend; item-level cents are shown only when they add up to the
 * backend's item figure for that person, otherwise just the items are listed.
 */
export function itemLinesFor(
  session: Session,
  billId: string,
  participantId: string,
  backendItemCents: number,
): { lines: ItemLine[]; showCents: boolean } {
  const bill = session.bills.find((b) => b.id === billId);
  if (!bill) return { lines: [], showCents: false };
  const bd = calculateBill(bill, session.participants).breakdowns.find(
    (x) => x.participantId === participantId,
  );
  const lines = bd?.items ?? [];
  return { lines, showCents: (bd?.subtotalCents ?? -1) === backendItemCents };
}

/* ------------------------------------------------------------------ messages
 *
 * Both messages are PLAIN TEXT only: no markdown symbols, because Telegram
 * and WhatsApp show pasted asterisks/underscores literally. Structure comes
 * from emoji, blank lines and "—" / "→" characters.
 */

type PersonBill = {
  billId: string;
  merchant: string;
  lines: {
    name: string;
    quantity: number;
    assignedQty: number | undefined;
    sharedWays: number;
    shareCents: number;
  }[];
  showCents: boolean;
  itemCents: number;
  serviceChargeCents: number;
  gstCents: number;
};

const nameOf = (session: Session, id: string) =>
  session.participants.find((p) => p.id === id)?.name ?? "Someone";

const phoneOf = (session: Session, id: string) =>
  session.participants.find((p) => p.id === id)?.phone?.trim() ?? "";

/** What one person had on each bill, using the backend's per-bill figures. */
function personBills(session: Session, result: OkSettlement, participantId: string): PersonBill[] {
  const out: PersonBill[] = [];
  for (const r of result.billResults) {
    const share = r.shares.find((x) => x.participantId === participantId);
    if (!share || share.totalCents === 0) continue;
    const bill = session.bills.find((x) => x.id === r.billId);
    const { lines, showCents } = itemLinesFor(session, r.billId, participantId, share.itemCents);
    out.push({
      billId: r.billId,
      merchant: bill?.merchant.trim() ?? "",
      lines: lines.map((it) => {
        const src = bill?.items.find((x) => x.id === it.itemId);
        return {
          name: it.itemName.trim() || "Item",
          quantity: it.assignedQty ?? src?.qty ?? 1,
          assignedQty: it.assignedQty,
          sharedWays: it.sharedWays,
          shareCents: it.shareCents,
        };
      }),
      showCents,
      itemCents: share.itemCents,
      serviceChargeCents: share.serviceChargeCents,
      gstCents: share.gstCents,
    });
  }
  return out;
}

/** "Otter & Pebbles", "Dinner + Dessert", or "the bill" when no shop names were entered. */
function billsTitle(session: Session): string {
  const names = [...new Set(session.bills.map((b) => b.merchant.trim()).filter(Boolean))];
  if (names.length > 0) return names.join(" + ");
  return session.bills.length > 1 ? "the bills" : "the bill";
}

/**
 * Short message for the group chat: who had what (item names only) and who
 * pays whom. Amounts per item live in each person's own message instead.
 */
export function formatSummary(session: Session, result: OkSettlement): string {
  const lines: string[] = [];

  for (const bill of session.bills) {
    const payer = bill.payerId ? nameOf(session, bill.payerId) : "Someone";
    lines.push(`🧾 ${bill.merchant.trim() || "Bill"} — ${formatCents(bill.totalCents)} (paid by ${payer})`);
  }
  if (session.bills.length > 1) {
    const grand = result.billResults.reduce((s, r) => s + r.expectedTotalCents, 0);
    lines.push(`Total — ${formatCents(grand)}`);
  }

  for (const b of result.balances) {
    if (b.shareCents === 0) continue;
    const items = personBills(session, result, b.participantId).flatMap((v) =>
      v.lines.map((l) => `${l.assignedQty !== undefined ? `${l.assignedQty}x ` : ""}${l.name}`),
    );
    lines.push("", `${nameOf(session, b.participantId)} — ${formatCents(b.shareCents)}`);
    if (items.length > 0) lines.push(items.join(", "));
  }

  if (session.bills.some((b) => b.serviceChargeCents > 0 || b.gstCents > 0)) {
    lines.push("", "Service charge and GST are already included in each amount.");
  }

  lines.push("");
  if (result.transfers.length === 0) {
    lines.push("All square already — nobody owes anybody.");
  } else {
    lines.push("Who pays whom:");
    for (const t of result.transfers) {
      const phone = phoneOf(session, t.to);
      lines.push(
        `${nameOf(session, t.from)} → ${nameOf(session, t.to)} ${formatCents(t.amountCents)}` +
          (phone ? ` — PayNow ${phone}` : ""),
      );
    }
  }
  lines.push("", "Check your items above 👆 — React 🫡 once settled.");
  return lines.join("\n");
}

/** Everyone who has someone to pay, in the order the backend lists them. */
export function personalMessageRecipients(result: OkSettlement): string[] {
  const owing = new Set(result.transfers.map((t) => t.from));
  return result.balances.map((b) => b.participantId).filter((id) => owing.has(id));
}

/**
 * A message for ONE person to forward to them directly: what they had, what
 * they owe and who to pay. Returns null for someone who doesn't owe anything.
 */
export function formatPersonalMessage(
  session: Session,
  result: OkSettlement,
  participantId: string,
): string | null {
  const outgoing = result.transfers.filter((t) => t.from === participantId);
  if (outgoing.length === 0) return null;

  const owed = outgoing.reduce((s, t) => s + t.amountCents, 0);
  const first = outgoing[0];
  const lines: string[] = [
    outgoing.length === 1 && first
      ? `Eh ${nameOf(session, participantId)}, you owe ${nameOf(session, first.to)} ${formatCents(owed)} for ${billsTitle(session)} 🧾`
      : `Eh ${nameOf(session, participantId)}, you owe ${formatCents(owed)} for ${billsTitle(session)} 🧾`,
  ];

  const bills = personBills(session, result, participantId);
  const multiBill = bills.length > 1;
  let extras = 0;
  for (const v of bills) {
    lines.push("");
    if (multiBill) lines.push(`${v.merchant || "Bill"}:`);
    for (const l of v.lines) {
      const qty = l.quantity > 1 || l.assignedQty !== undefined ? `${l.quantity}x ` : "";
      const shared = l.sharedWays > 1 ? ` (shared ${l.sharedWays} ways)` : "";
      lines.push(`${qty}${l.name}${shared}${v.showCents ? ` — ${formatCents(l.shareCents)}` : ""}`);
    }
    if (!v.showCents) lines.push(`Items — ${formatCents(v.itemCents)}`);
    extras += v.serviceChargeCents + v.gstCents;
  }
  if (extras > 0) lines.push(`Service charge + GST — ${formatCents(extras)}`);

  const balance = result.balances.find((b) => b.participantId === participantId);
  if (balance) {
    lines.push("", `Your share — ${formatCents(balance.shareCents)}`);
    if (balance.paidCents > 0) {
      lines.push(`Already paid — ${formatCents(balance.paidCents)}`, `You owe — ${formatCents(owed)}`);
    }
  }

  lines.push("");
  if (outgoing.length === 1 && first) {
    const phone = phoneOf(session, first.to);
    if (phone) lines.push(`PayNow to ${nameOf(session, first.to)} — ${phone}`);
  } else {
    lines.push("Please pay:");
    for (const t of outgoing) {
      const phone = phoneOf(session, t.to);
      lines.push(`${nameOf(session, t.to)} ${formatCents(t.amountCents)}${phone ? ` — PayNow ${phone}` : ""}`);
    }
  }
  while (lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}
