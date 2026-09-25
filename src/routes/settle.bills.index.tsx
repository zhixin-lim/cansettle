import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Receipt, Trash2 } from "lucide-react";
import { useMemo } from "react";

import { Amount, DashedRule, Paper, PaperTitle, Stamp } from "@/components/receipt";
import { makeBill, useSession } from "@/lib/session-store";
import { calculateSession } from "@/lib/settlement";

export const Route = createFileRoute("/settle/bills/")({
  head: () => ({
    meta: [
      { title: "Add a bill — Settle This Makan" },
      {
        name: "description",
        content:
          "Enter each bill from the outing by hand: items, service charge, GST and who paid.",
      },
      { property: "og:title", content: "Add a bill" },
      {
        property: "og:description",
        content: "Enter the bills for this outing and check each one tallies.",
      },
    ],
  }),
  component: BillsPage,
});

function BillsPage() {
  const { session, dispatch, hydrated } = useSession();
  const navigate = useNavigate();
  const result = useMemo(() => calculateSession(session), [session]);

  const addBill = () => {
    const bill = makeBill();
    dispatch({ type: "addBill", bill });
    navigate({ to: "/settle/bills/$billId", params: { billId: bill.id } });
  };

  if (session.participants.length < 2 && hydrated) {
    return (
      <Paper>
        <PaperTitle subtitle="Add at least two people before you add a bill.">
          Hold on — who&apos;s splitting?
        </PaperTitle>
        <DashedRule className="mt-6" />
        <Link
          to="/settle/participants"
          className="flex w-full items-center justify-center rounded-sm bg-primary px-4 py-3 font-display text-lg text-primary-foreground"
        >
          Add people first
        </Link>
      </Paper>
    );
  }

  return (
    <div className="space-y-5">
      <Paper>
        <PaperTitle subtitle="One slip per bill. Dinner, dessert, drinks — add as many as you need.">
          Add a bill
        </PaperTitle>

        <DashedRule className="mt-6" />

        <button
          onClick={addBill}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 font-display text-lg text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          <Plus className="h-5 w-5" /> Enter manually
        </button>

        <button
          disabled
          className="mt-3 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-sm border border-dashed border-paper-line px-4 py-3 text-sm text-ink-soft"
        >
          <Receipt className="h-4 w-4" /> Upload a receipt — coming soon
        </button>
      </Paper>

      {session.bills.map((bill, i) => {
        const r = result.billResults[i];
        const noPayer = bill.payerId === null;
        const unassigned = r.unassignedItems.length;
        const ok = r.reconciles && unassigned === 0 && !noPayer;
        const payerName =
          session.participants.find((p) => p.id === bill.payerId)?.name ?? "—";

        return (
          <Paper key={bill.id} className={i % 2 ? "rotate-[0.4deg]" : "rotate-[-0.4deg]"}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-display text-xl text-ink">
                  {bill.merchant.trim() || "Untitled bill"}
                </h3>
                <p className="mt-1 text-xs text-ink-soft">
                  Paid by {payerName} · {bill.items.length}{" "}
                  {bill.items.length === 1 ? "item" : "items"}
                </p>
              </div>
              <Amount cents={bill.totalCents} className="shrink-0 text-lg font-semibold" />
            </div>

            <DashedRule />

            <div className="flex flex-wrap items-center gap-3">
              {ok ? (
                <Stamp>✓ Tallies</Stamp>
              ) : (
                <Stamp tone="bad">
                  {noPayer
                    ? "No payer yet"
                    : unassigned > 0
                      ? `${unassigned} unassigned`
                      : "Doesn't tally"}
                </Stamp>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Link
                  to="/settle/bills/$billId"
                  params={{ billId: bill.id }}
                  className="rounded-sm border border-input px-3 py-1.5 text-xs"
                >
                  Open bill
                </Link>
                <button
                  onClick={() => dispatch({ type: "removeBill", id: bill.id })}
                  aria-label="Delete bill"
                  className="rounded-sm p-1.5 text-ink-soft transition-colors hover:text-stamp"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Paper>
        );
      })}

      {session.bills.length > 0 ? (
        <Paper>
          {result.ready ? (
            <p className="mb-3 text-center text-sm text-rule">
              Steady — every bill tallies and every item is accounted for ✓
            </p>
          ) : (
            <p className="mb-3 text-center text-sm text-stamp">
              Fix the slips above before the final settlement.
            </p>
          )}
          <Link
            to="/settle/result"
            disabled={!result.ready}
            className="flex w-full items-center justify-center rounded-sm bg-primary px-4 py-3 font-display text-lg text-primary-foreground transition-transform hover:-translate-y-0.5 aria-disabled:pointer-events-none aria-disabled:opacity-40"
          >
            Who pays whom?
          </Link>
        </Paper>
      ) : null}
    </div>
  );
}
