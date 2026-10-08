import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Copy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { api, ApiError } from "@/lib/api";
import { formatCents, formatSummary, itemLinesFor } from "@/lib/settlement";
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
  const { session, hydrated, sessionId, unsavedBillIds } = useSession();
  const [open, setOpen] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["settlement", sessionId, session.bills.map((b) => b.id).join(",")],
    queryFn: () => api.getSettlement(sessionId!),
    enabled: hydrated && !!sessionId,
    refetchOnMount: "always",
  });

  const nameOf = (id: string) =>
    session.participants.find((p) => p.id === id)?.name ?? "Someone";

  if (!hydrated || (sessionId && query.isPending)) {
    return (
      <Paper>
        <PaperTitle>Adding it up…</PaperTitle>
      </Paper>
    );
  }

  const back = (
    <Link
      to="/settle/bills"
      className="flex w-full items-center justify-center rounded-sm bg-primary px-4 py-3 font-display text-lg text-primary-foreground"
    >
      Check the bills
    </Link>
  );

  if (query.isError) {
    return (
      <Paper>
        <PaperTitle subtitle={query.error instanceof ApiError ? query.error.message : "Please try again."}>
          Couldn&apos;t get the settlement
        </PaperTitle>
        <DashedRule className="mt-6" />
        <button
          onClick={() => void query.refetch()}
          className="flex w-full items-center justify-center rounded-sm bg-primary px-4 py-3 font-display text-lg text-primary-foreground"
        >
          Try again
        </button>
      </Paper>
    );
  }

  const result = query.data;
  if (!result || !result.ok || unsavedBillIds.length > 0) {
    const pending = result && !result.ok ? (result.unassignedItems ?? []) : [];
    return (
      <Paper>
        <PaperTitle subtitle="Every item needs someone assigned, and every bill has to be saved, before we can settle.">
          Not ready to settle yet
        </PaperTitle>
        <DashedRule className="mt-6" />
        {unsavedBillIds.length > 0 ? (
          <p className="mb-3 text-sm text-stamp">
            {unsavedBillIds.length} bill{unsavedBillIds.length === 1 ? "" : "s"} not saved yet — open it and tap
            &quot;Done with this bill&quot;.
          </p>
        ) : null}
        {pending.length > 0 ? (
          <>
            <p className="font-display text-base text-stamp">Still needs assigning:</p>
            <ul className="mb-3 mt-1 list-disc pl-5 text-sm text-ink">
              {pending.map((u) => (
                <li key={u.itemId}>{u.name.trim() || "Unnamed item"}</li>
              ))}
            </ul>
          </>
        ) : null}
        {back}
      </Paper>
    );
  }

  const grandTotalCents = result.billResults.reduce((s, r) => s + r.expectedTotalCents, 0);
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
                key={`${t.from}-${t.to}-${i}`}
                className="flex items-baseline gap-2"
              >
                <span className="min-w-0 truncate font-display text-lg">
                  {nameOf(t.from)} → {nameOf(t.to)}
                </span>
                <span className="leader" aria-hidden />
                <Amount cents={t.amountCents} className="shrink-0 text-lg font-semibold" />
              </li>
            ))}
          </ul>
        )}

        <DashedRule />
        <p className="text-center font-hand text-xl text-stamp">React 🫡 once settled.</p>
      </Paper>

      {/* ------------------------------------------- per person */}
      <Paper>
        <PaperTitle>Each person</PaperTitle>
        <DashedRule className="mt-6" />

        <ul className="divide-y divide-dashed divide-paper-line">
          {result.balances.map((b) => {
            const isOpen = open === b.participantId;
            const lines = result.billResults.map((r) => {
              const share = r.shares.find((x) => x.participantId === b.participantId);
              const detail = itemLinesFor(session, r.billId, b.participantId, share?.itemCents ?? 0);
              return {
                billId: r.billId,
                merchant: session.bills.find((x) => x.id === r.billId)?.merchant ?? "",
                share,
                ...detail,
              };
            });

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
                    {lines.map(({ billId, merchant, share, lines: items, showCents }) => (
                      <div key={billId} className="mb-4 last:mb-0">
                        <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-ink-soft">
                          {merchant.trim() || "Bill"}
                        </p>
                        <DashedRule className="my-2" />
                        {items.length === 0 ? (
                          <p className="text-xs text-ink-soft">Nothing on this bill.</p>
                        ) : (
                          items.map((line) => (
                            <Row
                              key={line.itemId}
                              label={
                                <>
                                  {line.itemName.trim() || "Unnamed item"}
                                  {line.assignedQty !== undefined ? (
                                    <em className="ml-1 text-xs not-italic text-ink-soft">({line.assignedQty} ×)</em>
                                  ) : null}
                                  {line.sharedWays > 1 ? (
                                    <em className="ml-1 text-xs not-italic text-ink-soft">(shared {line.sharedWays} ways)</em>
                                  ) : null}
                                </>
                              }
                              amount={showCents ? line.shareCents : ""}
                            />
                          ))
                        )}
                        <DashedRule className="my-2" />
                        <Row label="Item subtotal" amount={share?.itemCents ?? 0} />
                        {share?.serviceChargeCents ? (
                          <Row label="Service charge" amount={share.serviceChargeCents} />
                        ) : null}
                        {share?.gstCents ? <Row label="GST" amount={share.gstCents} /> : null}
                        <Row label="Total" amount={share?.totalCents ?? 0} strong />
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
        <Row label="Grand total" amount={grandTotalCents} strong />
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
