import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Amount,
  DashedRule,
  Paper,
  PaperTitle,
  Perforation,
  Row,
} from "@/components/receipt";
import { useSession } from "@/lib/session-store";
import { calculateSession, formatCents, formatSummary } from "@/lib/settlement";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settle/result")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Who pays whom? — Settle This Makan" },
      {
        name: "description",
        content:
          "The final settlement: each person's exact share, the simplest set of transfers, and a message for the group chat.",
      },
      { property: "og:title", content: "Who pays whom?" },
      {
        property: "og:description",
        content: "Final shares, simplified transfers and a copyable summary.",
      },
    ],
  }),
  component: ResultPage,
});

function ResultPage() {
  const { session, hydrated } = useSession();
  const result = useMemo(() => calculateSession(session), [session]);
  const [open, setOpen] = useState<string | null>(null);

  const nameOf = (id: string) =>
    session.participants.find((p) => p.id === id)?.name ?? "Someone";

  if (!hydrated) {
    return (
      <Paper>
        <PaperTitle>Adding it up…</PaperTitle>
      </Paper>
    );
  }

  if (!result.ready) {
    return (
      <Paper>
        <PaperTitle subtitle="Every bill needs a payer, every item needs an owner, and each bill has to tally before we can settle.">
          Not ready to settle yet
        </PaperTitle>
        <DashedRule className="mt-6" />
        <Link
          to="/settle/bills"
          className="flex w-full items-center justify-center rounded-sm bg-primary px-4 py-3 font-display text-lg text-primary-foreground"
        >
          Check the bills
        </Link>
      </Paper>
    );
  }

  const summary = formatSummary(session, result);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      toast.success("Copied — paste it in the group chat");
    } catch {
      toast.error("Couldn't copy. Select the text below and copy it manually.");
    }
  };

  return (
    <div className="space-y-5">
      <Paper>
        <PaperTitle subtitle="Everything across all the bills, netted off in one go.">
          Who pays whom?
        </PaperTitle>

        <Perforation />

        {result.transfers.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-soft">
            All square already — nobody owes anybody.
          </p>
        ) : (
          <ul className="space-y-3">
            {result.transfers.map((t, i) => (
              <li
                key={`${t.fromId}-${t.toId}-${i}`}
                className="flex items-baseline gap-2"
              >
                <span className="min-w-0 truncate font-display text-lg">
                  {nameOf(t.fromId)} → {nameOf(t.toId)}
                </span>
                <span className="leader" aria-hidden />
                <Amount cents={t.amountCents} className="shrink-0 text-lg font-semibold" />
              </li>
            ))}
          </ul>
        )}

        <DashedRule />
        <p className="text-center font-hand text-xl text-stamp">Can settle already.</p>
      </Paper>

      {/* ------------------------------------------- per person */}
      <Paper>
        <PaperTitle>Each person</PaperTitle>
        <DashedRule className="mt-6" />

        <ul className="divide-y divide-dashed divide-paper-line">
          {result.balances.map((b) => {
            const isOpen = open === b.participantId;
            const lines = result.billResults.map((r, i) => ({
              bill: session.bills[i]!,
              breakdown: r.breakdowns.find(
                (x) => x.participantId === b.participantId,
              )!,
            }));

            return (
              <li key={b.participantId} className="py-3">
                <div className="flex items-baseline">
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {nameOf(b.participantId)}
                  </span>
                  <span className="leader" aria-hidden />
                  <Amount cents={b.shareCents} className="shrink-0 text-base font-semibold" />
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Paid {formatCents(b.paidCents)} ·{" "}
                  {b.netCents === 0
                    ? "all square"
                    : b.netCents > 0
                      ? `should receive ${formatCents(b.netCents)}`
                      : `owes ${formatCents(-b.netCents)}`}
                </p>

                <button
                  onClick={() => setOpen(isOpen ? null : b.participantId)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-rule"
                >
                  How was this calculated?
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")}
                  />
                </button>

                {isOpen ? (
                  <div className="mt-3 rounded-sm border border-dashed border-paper-line p-3">
                    {lines.map(({ bill, breakdown }) => (
                      <div key={bill.id} className="mb-4 last:mb-0">
                        <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-ink-soft">
                          {bill.merchant.trim() || "Bill"}
                        </p>
                        <DashedRule className="my-2" />
                        {breakdown.items.length === 0 ? (
                          <p className="text-xs text-ink-soft">Nothing on this bill.</p>
                        ) : (
                          breakdown.items.map((line) => (
                            <Row
                              key={line.itemId}
                              label={
                                <>
                                  {line.itemName.trim() || "Unnamed item"}
                                  {line.assignedQty !== undefined ? (
                                    <em className="ml-1 text-xs not-italic text-ink-soft">
                                      ({line.assignedQty} ×)
                                    </em>
                                  ) : null}
                                  {line.sharedWays > 1 ? (
                                    <em className="ml-1 text-xs not-italic text-ink-soft">
                                      (shared {line.sharedWays} ways)
                                    </em>
                                  ) : null}
                                </>
                              }
                              amount={line.shareCents}
                            />
                          ))
                        )}
                        <DashedRule className="my-2" />
                        <Row label="Item subtotal" amount={breakdown.subtotalCents} />
                        {breakdown.serviceChargeCents !== 0 ? (
                          <Row
                            label="Service charge"
                            amount={breakdown.serviceChargeCents}
                          />
                        ) : null}
                        {breakdown.gstCents !== 0 ? (
                          <Row label="GST" amount={breakdown.gstCents} />
                        ) : null}
                        {breakdown.roundingCents !== 0 ? (
                          <Row
                            label="Rounding residual"
                            amount={breakdown.roundingCents}
                            muted
                          />
                        ) : null}
                        <Row label="Total" amount={breakdown.totalCents} strong />
                      </div>
                    ))}

                    <DashedRule />
                    <p className="text-xs leading-relaxed text-ink-soft">
                      Quantity-assigned items use each person&apos;s quantity × price each.
                      Shared items are divided equally in whole cents, with any leftover
                      cent going to whoever was added first. Service charge and GST are
                      split in proportion to each person&apos;s pre-tax item subtotal,
                      and any rounding residual goes to the largest pre-tax subtotal. The
                      shares on each bill always add up to the bill total.
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <DashedRule />
        <Row label="Grand total" amount={result.grandTotalCents} strong />
      </Paper>

      {/* ------------------------------------------- copy */}
      <Paper>
        <PaperTitle>Send it to the group</PaperTitle>
        <DashedRule className="mt-6" />
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-sm border border-dashed border-paper-line p-3 font-mono text-xs text-ink">
          {summary}
        </pre>
        <button
          onClick={copy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 font-display text-lg text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          <Copy className="h-4 w-4" /> Copy the message
        </button>
      </Paper>
    </div>
  );
}
