import { formatCents } from "./money";
import type { Session, SessionResult } from "./types";

/** Plain-text summary for pasting into WhatsApp / Telegram. */
export function formatSummary(session: Session, result: SessionResult): string {
  const nameOf = (id: string) =>
    session.participants.find((p) => p.id === id)?.name ?? "Someone";

  const lines: string[] = [];
  lines.push("Settlement");
  lines.push("");

  for (const bill of session.bills) {
    const label = bill.merchant.trim() || "Bill";
    const payer = bill.payerId ? nameOf(bill.payerId) : "Someone";
    lines.push(`${label} — ${formatCents(bill.totalCents)} (paid by ${payer})`);
  }

  lines.push("");
  lines.push(`Total: ${formatCents(result.grandTotalCents)}`);
  lines.push("");
  lines.push("What each person had (please check before paying):");
  const multiBill = session.bills.length > 1;
  for (const b of result.balances) {
    lines.push("");
    lines.push(`${nameOf(b.participantId)} — ${formatCents(b.shareCents)}`);
    for (const billResult of result.billResults) {
      const bill = session.bills.find((x) => x.id === billResult.billId);
      const bd = billResult.breakdowns.find((x) => x.participantId === b.participantId);
      if (!bill || !bd || bd.totalCents === 0) continue;
      if (multiBill) lines.push(`  [${bill.merchant.trim() || "Bill"}]`);
      for (const it of bd.items) {
        const src = bill.items.find((x) => x.id === it.itemId);
        const qty = src && src.qty > 1 ? `${src.qty}x ` : "";
        const shared =
          it.sharedWays > 1
            ? ` (shared ${it.sharedWays} ways, ${formatCents(it.lineTotalCents)})`
            : "";
        lines.push(
          `  - ${qty}${it.itemName.trim() || "Item"}${shared}: ${formatCents(it.shareCents)}`,
        );
      }
      if (bd.serviceChargeCents)
        lines.push(`  - Service charge: ${formatCents(bd.serviceChargeCents)}`);
      if (bd.gstCents) lines.push(`  - GST: ${formatCents(bd.gstCents)}`);
      if (bd.roundingCents) lines.push(`  - Rounding: ${formatCents(bd.roundingCents)}`);
    }
  }

  lines.push("");
  if (result.transfers.length === 0) {
    lines.push("All square already — nobody owes anybody.");
  } else {
    lines.push("Who pays whom:");
    for (const t of result.transfers) {
      const phone = session.participants.find((p) => p.id === t.toId)?.phone?.trim();
      lines.push(
        `• ${nameOf(t.fromId)} → ${nameOf(t.toId)}: ${formatCents(t.amountCents)}` +
          (phone ? ` — PayNow to ${phone}` : ""),
      );
    }
  }

  lines.push("");
  lines.push("Can settle already 🫡");
  return lines.join("\n");
}
