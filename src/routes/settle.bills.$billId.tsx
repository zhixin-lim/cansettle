import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MoneyInput } from "@/components/money-input";
import { ReceiptScan } from "@/components/receipt-scan";
import { Button } from "@/components/ui/button";
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

/**
 * Qty field that behaves while typing: the local text is free while editing
 * (so "1" can become "31" become "3"), and only valid values are committed.
 * On blur, empty or invalid input snaps back to the last committed quantity.
 */
function QtyInput({
  value,
  onCommit,
  className,
  min = 1,
  label = "Quantity",
}: {
  value: number;
  onCommit: (qty: number) => void;
  className?: string;
  min?: number;
  label?: string;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  // Follow outside changes (undo, new item) unless the user is mid-edit.
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  const commit = () => {
    focused.current = false;
    const parsed = Number.parseInt(text, 10);
    if (Number.isFinite(parsed)) {
      const qty = Math.max(min, Math.min(99, parsed));
      onCommit(qty);
      setText(String(qty));
    } else {
      setText(String(value));
    }
  };

  return (
    <input
      value={text}
      inputMode="numeric"
      aria-label={label}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
        setText(digits);
        const parsed = Number.parseInt(digits, 10);
        if (Number.isFinite(parsed) && parsed >= min) {
          onCommit(Math.min(99, parsed));
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

export const Route = createFileRoute("/settle/bills/$billId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

  // Auto-charge helpers: most Singapore places charge 10% service charge and
  // 9% GST (GST applies on top of items + service charge, the x1.199 rule).
  // Toggling one on fills the amount in; the field stays editable, and typing
  // your own amount switches the auto mode back off.
  const [autoSC, setAutoSC] = useState(false);
  const [autoGST, setAutoGST] = useState(false);
  const [scanned, setScanned] = useState(false);
  const itemsSubtotalCents = result?.itemsSubtotalCents ?? 0;
  const serviceCents = bill?.serviceChargeCents ?? 0;

  useEffect(() => {
    if (!autoSC || !bill) return;
    const v = Math.round(itemsSubtotalCents * 0.1);
    if (v !== bill.serviceChargeCents) {
      dispatch({ type: "updateBill", id: bill.id, patch: { serviceChargeCents: v } });
    }
  }, [autoSC, itemsSubtotalCents, bill, dispatch]);

  useEffect(() => {
    if (!autoGST || !bill) return;
    const v = Math.round((itemsSubtotalCents + serviceCents) * 0.09);
    if (v !== bill.gstCents) {
      dispatch({ type: "updateBill", id: bill.id, patch: { gstCents: v } });
    }
  }, [autoGST, itemsSubtotalCents, serviceCents, bill, dispatch]);

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

  const missing: string[] = [];
  if (bill.items.length === 0) missing.push("At least one item from the receipt");
  bill.items.forEach((it, i) => {
    const label = it.name.trim() || `Item ${i + 1}`;
    if (!it.name.trim()) missing.push(`Item ${i + 1}: name`);
    if (it.unitPriceCents <= 0) missing.push(`${label}: price each`);
  });
  if (bill.totalCents <= 0) missing.push("Total on the bill");
  if (!allAssigned)
    missing.push(
      `Who had: ${result.unassignedItems.map((u) => `${u.itemName.trim() || "unnamed item"}${u.reason ? ` — ${u.reason}` : ""}`).join(", ")}`,
    );
  if (bill.totalCents > 0 && bill.items.length > 0 && !result.reconciles)
    missing.push(
      `Numbers don't tally — off by ${formatCents(Math.abs(result.differenceCents))}`,
    );
  if (!hasPayer) missing.push("Who paid this bill");

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ bill entry */}
      <Paper>
        <PaperTitle subtitle="Type it exactly as printed. Tap auto 10% / 9% to fill in the usual charges, or enter them yourself.">
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

        <div className="mt-4">
          <ReceiptScan
            hasExisting={bill.items.length > 0}
            onScanned={(r) => {
              setAutoSC(false);
              setAutoGST(false);
              for (const it of bill.items)
                dispatch({ type: "removeItem", billId: bill.id, itemId: it.id });
              for (const it of r.items)
                dispatch({ type: "addItem", billId: bill.id, item: { ...makeItem(), ...it } });
              update({
                ...(r.merchant ? { merchant: r.merchant } : {}),
                serviceChargeCents: r.serviceChargeCents,
                gstCents: r.gstCents,
                totalCents: r.totalCents,
              });
              setScanned(true);
            }}
          />
          {scanned ? (
            <p className="mt-2 text-center text-xs text-stamp">
              Filled in from the photo — check every line against the receipt before carrying on.
            </p>
          ) : null}
        </div>

        <Perforation />

        <ColumnHeads cols={["Qty · Item", "Price each"]} />
        <DashedRule className="my-2" />

        {bill.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-soft">
            No items yet. Add the first line off the receipt.
          </p>
        ) : (
          <ul className="space-y-2">
            {bill.items.map((item) => (
              <li key={item.id} className="grid grid-cols-[15%_minmax(0,1fr)_25%_1.5rem] items-center gap-1">
                <QtyInput
                  value={item.qty}
                  onCommit={(qty) =>
                    dispatch({
                      type: "updateItem",
                      billId: bill.id,
                      itemId: item.id,
                      patch: { qty },
                    })
                  }
                  className="tabular min-w-0 w-full rounded-sm border border-input bg-transparent px-1 py-1.5 text-center text-base outline-hidden focus:border-rule"
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
                  className="min-w-0 w-full rounded-sm border border-input bg-transparent px-1 py-1.5 text-base outline-hidden focus:border-rule"
                />
                  <MoneyInput
                    className="min-w-0 w-full [&_input]:pl-4 [&_input]:pr-1 [&_span]:left-1"
                    aria-label="Price per item"
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      dispatch({ type: "removeItem", billId: bill.id, itemId: item.id })
                    }
                    aria-label="Remove item"
                    title="Remove item"
                    className="h-8 w-6 shrink-0 rounded-sm p-0 text-ink-soft transition-colors hover:text-stamp"
                  >
                    <X className="h-4 w-4" />
                  </Button>
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
          <ChargeRow
            label="Service charge"
            action={
              <AutoToggle
                on={autoSC}
                label="10%"
                ariaLabel="Auto-fill 10% service charge"
                onClick={() => setAutoSC((v) => !v)}
              />
            }
          >
            <MoneyInput
              aria-label="Service charge"
              valueCents={bill.serviceChargeCents}
              onChangeCents={(cents) => {
                setAutoSC(false);
                update({ serviceChargeCents: cents });
              }}
            />
          </ChargeRow>
          <ChargeRow
            label="GST"
            action={
              <AutoToggle
                on={autoGST}
                label="9%"
                ariaLabel="Auto-fill 9% GST"
                onClick={() => setAutoGST((v) => !v)}
              />
            }
          >
            <MoneyInput
              aria-label="GST"
              valueCents={bill.gstCents}
              onChangeCents={(cents) => {
                setAutoGST(false);
                update({ gstCents: cents });
              }}
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
        <PaperTitle>
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
              const byQuantity = item.ownerQuantities !== undefined;
              const assigned = session.participants.reduce(
                (sum, p) => sum + (item.ownerQuantities?.[p.id] ?? 0), 0);
              return (
                <li key={item.id}>
                  <div className="flex items-baseline">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {item.qty} × {item.name.trim() || "Unnamed item"}
                    </span>
                    <span className="leader" aria-hidden />
                    <Amount cents={total} className="shrink-0 text-sm" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={`Split method for ${item.name}`}>
                    {[false, true].map((quantityMode) => (
                      <Button key={String(quantityMode)} size="sm" variant="outline"
                        aria-pressed={byQuantity === quantityMode}
                        className={cn("rounded-sm", byQuantity === quantityMode && "border-rule bg-rule text-paper")}
                        onClick={() => byQuantity !== quantityMode && dispatch({ type: "updateItem", billId: bill.id,
                          itemId: item.id, patch: {
                            ownerQuantities: quantityMode ? {} : undefined,
                            ownerIds: quantityMode ? [] : session.participants.filter(
                              (p) => (item.ownerQuantities?.[p.id] ?? 0) > 0).map((p) => p.id),
                          } })}>
                        {quantityMode ? "Assign quantities" : "Share equally"}
                      </Button>
                    ))}
                  </div>
                  {byQuantity ? (
                    <div className="mt-3 space-y-2">
                      {session.participants.map((p) => (
                        <label key={p.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 break-words">{p.name}</span>
                          <QtyInput min={0} value={item.ownerQuantities?.[p.id] ?? 0}
                            label={`Quantity of ${item.name || "item"} for ${p.name}`}
                            className="tabular w-16 shrink-0 rounded-sm border border-input bg-transparent px-2 py-1.5 text-center text-sm outline-hidden focus:border-rule"
                            onCommit={(qty) => dispatch({ type: "updateItem", billId: bill.id,
                              itemId: item.id, patch: { ownerQuantities: {
                                ...item.ownerQuantities, [p.id]: qty,
                              } } })} />
                        </label>
                      ))}
                      <p role="status" className={cn("text-xs", assigned === item.qty ? "text-rule" : "text-stamp")}>
                        {assigned} of {item.qty} assigned
                        {assigned < item.qty ? ` — ${item.qty - assigned} still to assign`
                          : assigned > item.qty ? ` — ${assigned - item.qty} too many assigned` : " ✓"}
                      </p>
                    </div>
                  ) : <>
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
                         ? `${owners[0]?.name} — ${formatCents(total)}`
                        : `Shared ${owners.length} ways — about ${formatCents(
                            Math.trunc(total / owners.length),
                          )} each`}
                  </p>
                  </>}
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
                 .map((u) => `${u.itemName.trim() || "An unnamed item"}${u.reason ? ` — ${u.reason}` : ""}`)
                .join(", ")}{" "}
              needs its assignment checked.
            </p>
          </div>
        ) : null}
      </Paper>

      {/* ------------------------------------------------ payer */}
      <Paper>
        <PaperTitle subtitle="Choose the person who actually paid.">
          Who paid this bill?
        </PaperTitle>
        <DashedRule className="mt-6" />
        <div className="flex flex-wrap gap-2">
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

      {missing.length > 0 ? (
        <div className="rounded-sm border border-stamp/40 bg-paper p-3">
          <p className="font-display text-base text-stamp">Not done yet — still missing:</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
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
          disabled={missing.length > 0}
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
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2">
      <span className="flex items-center gap-2 text-sm text-ink-soft">
        {label}
        {action}
      </span>
      {children}
    </div>
  );
}

function AutoToggle({
  on,
  label,
  ariaLabel,
  onClick,
}: {
  on: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[0.65rem] uppercase tracking-wide transition-colors",
        on
          ? "border-rule bg-rule text-paper"
          : "border-dashed border-paper-line text-ink-soft hover:border-rule",
      )}
    >
      {on ? `${label} ✓` : `auto ${label}`}
    </button>
  );
}
