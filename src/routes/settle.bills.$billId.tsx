import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MoneyInput } from "@/components/money-input";
import {
  Amount,
  ColumnHeads,
  DashedRule,
  Paper,
  PaperTitle,
  Perforation,
  Stamp,
} from "@/components/receipt";
import { cn } from "@/lib/utils";
import { makeItem, useSession } from "@/lib/session-store";
import {
  calculateBill,
  formatCents,
  lineTotalCents,
  type Bill,
} from "@/lib/settlement";

export const Route = createFileRoute("/settle/bills/$billId")({
  head: () => ({
    meta: [
      { title: "Bill details — Settle This Makan" },
      {
        name: "description",
        content:
          "Enter the items, service charge and GST, then assign every item to the people who had it.",
      },
      { property: "og:title", content: "Bill details" },
      {
        property: "og:description",
        content: "Enter a bill by hand and assign each item to who had it.",
      },
    ],
  }),
  component: BillPage,
});

function BillPage() {
  const { billId } = Route.useParams();
  const { session, dispatch, hydrated } = useSession();
  const navigate = useNavigate();

  const bill = session.bills.find((b) => b.id === billId);
  const result = useMemo(
    () => (bill ? calculateBill(bill, session.participants) : null),
    [bill, session.participants],
  );

  if (!bill || !result) {
    return (
      <Paper>
        <PaperTitle subtitle={hydrated ? "This bill is no longer in the session." : " "}>
          {hydrated ? "Bill not found" : "Loading…"}
        </PaperTitle>
        {hydrated ? (
          <>
            <DashedRule className="mt-6" />
            <Link
              to="/settle/bills"
              className="flex w-full items-center justify-center rounded-sm bg-primary px-4 py-3 font-display text-lg text-primary-foreground"
            >
              Back to bills
            </Link>
          </>
        ) : null}
      </Paper>
    );
  }

  const update = (patch: Partial<Omit<Bill, "id" | "items">>) =>
    dispatch({ type: "updateBill", id: bill.id, patch });

  const allAssigned = result.unassignedItems.length === 0;
  const hasPayer = bill.payerId !== null;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ bill entry */}
      <Paper>
        <PaperTitle subtitle="Type it exactly as printed. We only ever use the service charge and GST you enter.">
          The bill
        </PaperTitle>

        <DashedRule className="mt-6" />

        <label className="block text-xs uppercase tracking-[0.16em] text-ink-soft">
          Restaurant / merchant
        </label>
        <input
          value={bill.merchant}
          onChange={(e) => update({ merchant: e.target.value.slice(0, 60) })}
          placeholder="Name on the receipt"
          className="mt-1 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm outline-hidden focus:border-rule focus:ring-1 focus:ring-rule"
        />

        <label className="mt-4 block text-xs uppercase tracking-[0.16em] text-ink-soft">
          Who paid this bill?
        </label>
        <p className="text-xs text-ink-soft">Choose the person who actually paid.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {session.participants.map((p) => (
            <button
              key={p.id}
              onClick={() => update({ payerId: bill.payerId === p.id ? null : p.id })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                bill.payerId === p.id
                  ? "border-rule bg-rule text-paper"
                  : "border-input text-ink hover:border-rule",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>

        <Perforation />

        <ColumnHeads cols={["Qty · Item", "Amount"]} />
        <DashedRule className="my-2" />

        {bill.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-soft">
            No items yet. Add the first line off the receipt.
          </p>
        ) : (
          <ul className="space-y-2">
            {bill.items.map((item) => (
              <li key={item.id} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)_7rem]">
                <input
                  value={item.qty}
                  inputMode="numeric"
                  aria-label="Quantity"
                  onChange={(e) =>
                    dispatch({
                      type: "updateItem",
                      billId: bill.id,
                      itemId: item.id,
                      patch: {
                        qty: Math.max(1, Math.min(99, Number(e.target.value) || 1)),
                      },
                    })
                  }
                  className="tabular rounded-sm border border-input bg-transparent px-2 py-1.5 text-center text-sm outline-hidden focus:border-rule"
                />
                <input
                  value={item.name}
                  placeholder="Item name"
                  aria-label="Item name"
                  onChange={(e) =>
                    dispatch({
                      type: "updateItem",
                      billId: bill.id,
                      itemId: item.id,
                      patch: { name: e.target.value.slice(0, 60) },
                    })
                  }
                  className="min-w-0 rounded-sm border border-input bg-transparent px-2 py-1.5 text-sm outline-hidden focus:border-rule"
                />
                <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                  <MoneyInput
                    className="flex-1"
                    aria-label="Unit price"
                    valueCents={item.unitPriceCents}
                    onChangeCents={(cents) =>
                      dispatch({
                        type: "updateItem",
                        billId: bill.id,
                        itemId: item.id,
                        patch: { unitPriceCents: cents },
                      })
                    }
                  />
                  <button
                    onClick={() =>
                      dispatch({ type: "removeItem", billId: bill.id, itemId: item.id })
                    }
                    aria-label="Remove item"
                    className="shrink-0 rounded-sm p-1 text-ink-soft transition-colors hover:text-stamp"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={() =>
            dispatch({ type: "addItem", billId: bill.id, item: makeItem() })
          }
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-paper-line py-2 text-sm text-ink-soft transition-colors hover:border-rule hover:text-ink"
        >
          <Plus className="h-4 w-4" /> Add item
        </button>

        <DashedRule />

        <div className="space-y-2">
          <ChargeRow label="Service charge">
            <MoneyInput
              aria-label="Service charge"
              valueCents={bill.serviceChargeCents}
              onChangeCents={(cents) => update({ serviceChargeCents: cents })}
            />
          </ChargeRow>
          <ChargeRow label="GST">
            <MoneyInput
              aria-label="GST"
              valueCents={bill.gstCents}
              onChangeCents={(cents) => update({ gstCents: cents })}
            />
          </ChargeRow>
          <ChargeRow label="Total on the bill">
            <MoneyInput
              aria-label="Bill total"
              valueCents={bill.totalCents}
              onChangeCents={(cents) => update({ totalCents: cents })}
            />
          </ChargeRow>
        </div>

        <DashedRule />

        <div className="flex items-baseline justify-between text-sm">
          <span className="text-ink-soft">Items + charges</span>
          <Amount cents={result.calculatedTotalCents} />
        </div>

        <div className="mt-3">
          {result.reconciles ? (
            <Stamp>✓ The numbers tally</Stamp>
          ) : (
            <div className="rounded-sm border border-stamp/40 bg-stamp/5 p-3">
              <p className="font-display text-base text-stamp">
                Eh, something doesn&apos;t tally.
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Items and charges come to {formatCents(result.calculatedTotalCents)} but
                the bill says {formatCents(result.billTotalCents)} — a difference of{" "}
                {formatCents(Math.abs(result.differenceCents))}. Check the item prices,
                service charge, GST and total before continuing.
              </p>
            </div>
          )}
        </div>
      </Paper>

      {/* ------------------------------------------------ ownership */}
      <Paper>
        <PaperTitle subtitle="Select everyone who should share each item. Shared items split equally.">
          Who had what?
        </PaperTitle>

        <DashedRule className="mt-6" />

        {bill.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-soft">
            Add items above first.
          </p>
        ) : (
          <ul className="space-y-4">
            {bill.items.map((item) => {
              const owners = session.participants.filter((p) =>
                item.ownerIds.includes(p.id),
              );
              const total = lineTotalCents(item.qty, item.unitPriceCents);
              return (
                <li key={item.id}>
                  <div className="flex items-baseline">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {item.name.trim() || "Unnamed item"}
                    </span>
                    <span className="leader" aria-hidden />
                    <Amount cents={total} className="shrink-0 text-sm" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {session.participants.map((p) => {
                      const on = item.ownerIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() =>
                            dispatch({
                              type: "toggleOwner",
                              billId: bill.id,
                              itemId: item.id,
                              participantId: p.id,
                            })
                          }
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            on
                              ? "border-rule bg-rule text-paper"
                              : "border-input text-ink-soft hover:border-rule",
                          )}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                    <button
                      onClick={() =>
                        dispatch({
                          type: "setOwners",
                          billId: bill.id,
                          itemId: item.id,
                          participantIds:
                            owners.length === session.participants.length
                              ? []
                              : session.participants.map((p) => p.id),
                        })
                      }
                      className="rounded-full border border-dashed border-paper-line px-3 py-1 text-xs text-ink-soft"
                    >
                      {owners.length === session.participants.length
                        ? "Clear"
                        : "Everyone"}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {owners.length === 0
                      ? "Not assigned yet."
                      : owners.length === 1
                        ? `${owners[0]!.name} — ${formatCents(total)}`
                        : `Shared ${owners.length} ways — about ${formatCents(
                            Math.trunc(total / owners.length),
                          )} each`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        <DashedRule />

        {allAssigned && bill.items.length > 0 ? (
          <p className="text-center text-sm text-rule">
            Steady — every item is accounted for ✓
          </p>
        ) : bill.items.length > 0 ? (
          <div className="rounded-sm border border-stamp/40 bg-stamp/5 p-3">
            <p className="font-display text-base text-stamp">
              Alamak, one more item!
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {result.unassignedItems
                .map((u) => u.itemName.trim() || "An unnamed item")
                .join(", ")}{" "}
              still needs to be assigned.
            </p>
          </div>
        ) : null}
      </Paper>

      {/* ------------------------------------------------ per person */}
      {allAssigned && result.reconciles && bill.items.length > 0 ? (
        <Paper>
          <PaperTitle>This bill, per person</PaperTitle>
          <DashedRule className="mt-6" />
          <ul className="space-y-2">
            {result.breakdowns.map((b) => {
              const p = session.participants.find((x) => x.id === b.participantId);
              return (
                <li key={b.participantId} className="flex items-baseline">
                  <span className="min-w-0 truncate text-sm">{p?.name}</span>
                  <span className="leader" aria-hidden />
                  <Amount cents={b.totalCents} className="shrink-0 text-sm" />
                </li>
              );
            })}
          </ul>
          <DashedRule />
          <div className="flex items-baseline">
            <span className="font-display text-lg">Total</span>
            <span className="leader" aria-hidden />
            <Amount cents={bill.totalCents} className="text-lg font-semibold" />
          </div>
        </Paper>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link
          to="/settle/bills"
          className="flex-1 rounded-sm border border-foreground/20 px-4 py-3 text-center text-sm"
        >
          Back to bills
        </Link>
        <button
          onClick={() => navigate({ to: "/settle/bills" })}
          disabled={!hasPayer || !allAssigned || !result.reconciles}
          className="flex-1 rounded-sm bg-primary px-4 py-3 font-display text-lg text-primary-foreground disabled:opacity-40"
        >
          Done with this bill
        </button>
      </div>
    </div>
  );
}

function ChargeRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2">
      <span className="text-sm text-ink-soft">{label}</span>
      {children}
    </div>
  );
}
