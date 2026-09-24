import { formatCents } from "./money";
import type { Session, SessionResult } from "./types";

/** Plain-text summary for pasting into WhatsApp / Telegram. */
export function formatSummary(session: Session, result: SessionResult): string {
  const nameOf = (id: string) =>
    session.participants.find((p) => p.id === id)?.name ?? "Someone";

  const lines: string[] = [];
  lines.push("🧾 Settlement");
  lines.push("");

  for (const bill of session.bills) {
    const label = bill.merchant.trim() || "Bill";
    const payer = bill.payerId ? nameOf(bill.payerId) : "Someone";
    lines.push(`${label} — ${formatCents(bill.totalCents)} (paid by ${payer})`);
  }

  lines.push("");
  lines.push(`Total: ${formatCents(result.grandTotalCents)}`);
  lines.push("");
  lines.push("Each person's share:");
  for (const b of result.balances) {
    lines.push(`• ${nameOf(b.participantId)} — ${formatCents(b.shareCents)}`);
  }

  lines.push("");
  if (result.transfers.length === 0) {
    lines.push("All square already — nobody owes anybody.");
  } else {
    lines.push("Who pays whom:");
    for (const t of result.transfers) {
      lines.push(
        `• ${nameOf(t.fromId)} → ${nameOf(t.toId)}: ${formatCents(t.amountCents)}`,
      );
    }
  }

  lines.push("");
  lines.push("Can settle already 🫡");
  return lines.join("\n");
}
