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

/** Plain-text summary for pasting into WhatsApp / Telegram. */
export function formatSummary(session: Session, result: OkSettlement): string {
  const nameOf = (id: string) => session.participants.find((p) => p.id === id)?.name ?? "Someone";
  const lines: string[] = ["Settlement", ""];

  for (const bill of session.bills) {
    const payer = bill.payerId ? nameOf(bill.payerId) : "Someone";
    lines.push(`${bill.merchant.trim() || "Bill"} — ${formatCents(bill.totalCents)} (paid by ${payer})`);
  }
  const grand = result.billResults.reduce((s, r) => s + r.expectedTotalCents, 0);
  lines.push("", `Total: ${formatCents(grand)}`, "", "What each person had (please check before paying):");

  const multiBill = result.billResults.length > 1;
  for (const b of result.balances) {
    lines.push("", `${nameOf(b.participantId)} — ${formatCents(b.shareCents)}`);
    for (const r of result.billResults) {
      const share = r.shares.find((x) => x.participantId === b.participantId);
      if (!share || share.totalCents === 0) continue;
      const bill = session.bills.find((x) => x.id === r.billId);
      if (multiBill) lines.push(`  [${bill?.merchant.trim() || "Bill"}]`);
      const { lines: items, showCents } = itemLinesFor(session, r.billId, b.participantId, share.itemCents);
      for (const it of items) {
        const src = bill?.items.find((x) => x.id === it.itemId);
        const quantity = it.assignedQty ?? src?.qty ?? 1;
        const qty = quantity > 1 || it.assignedQty !== undefined ? `${quantity}x ` : "";
        const shared = it.sharedWays > 1 ? ` (shared ${it.sharedWays} ways)` : "";
        lines.push(
          `  - ${qty}${it.itemName.trim() || "Item"}${shared}` +
            (showCents ? `: ${formatCents(it.shareCents)}` : ""),
        );
      }
      if (!showCents) lines.push(`  - Items: ${formatCents(share.itemCents)}`);
      if (share.serviceChargeCents) lines.push(`  - Service charge: ${formatCents(share.serviceChargeCents)}`);
      if (share.gstCents) lines.push(`  - GST: ${formatCents(share.gstCents)}`);
    }
  }

  lines.push("");
  if (result.transfers.length === 0) {
    lines.push("All square already — nobody owes anybody.");
  } else {
    lines.push("Who pays whom:");
    for (const t of result.transfers) {
      const phone = session.participants.find((p) => p.id === t.to)?.phone?.trim();
      lines.push(
        `• ${nameOf(t.from)} → ${nameOf(t.to)}: ${formatCents(t.amountCents)}` +
          (phone ? ` — PayNow to ${phone}` : ""),
      );
    }
  }
  lines.push("", "React 🫡 once settled.");
  return lines.join("\n");
}
