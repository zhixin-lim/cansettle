# Settle This Makan — First Build

A one-off group settlement app: add everyone, add bills, say who had what, get exact shares and a copyable "who pays whom" message. No accounts, no history, nothing saved off your device.

## What you'll be able to do

1. **Start** — a landing screen with "Let's settle this makan" and one button: Start a settlement.
2. **Add everyone** — type names, including yourself (made explicit, no one auto-added).
3. **Add a bill** — "Enter manually" plus a greyed-out "Upload a receipt — coming soon".
4. **Enter the bill** — merchant name, who paid, items with quantity and price, then service charge, GST and the printed total. Service charge and GST only ever appear if you type them in.
5. **Say who had what** — tap people onto each item; shared items split equally. You can't continue while anything is unassigned ("Alamak, one more item!").
6. **Check it tallies** — each bill is reconciled against its printed total before it counts. Mismatch shows the exact gap and a link back to the bill.
7. **Add more bills** — dinner, then dessert, same group.
8. **Final settlement** — each person's net balance, then the simplified list of transfers, plus "How was this calculated?" on every person showing their items, subtotal, service charge, GST, rounding and total.
9. **Copy the message** — a plain-text summary ready to paste into WhatsApp or Telegram.

Everything starts empty. Your session is kept on your own device only, so a refresh won't lose your work, and there's a clear "Start over" that wipes it.

## Look and feel

Receipt-inspired: paper-toned surfaces, perforated/torn edges, a monospace numeric face for amounts against an expressive display face for headings, subtle imperfections. Warm and a bit quirky, but the numbers always read cleanly and have the strongest hierarchy. Singlish used sparingly in moments of feedback ("Steady — everything tallies ✓"), never in instructions.

I'll set this up as reusable design tokens so when you send the two reference images I can retune the palette and type in one place rather than rebuilding screens.

## Technical section

- **Engine first, UI second.** `src/lib/settlement/` holds pure TypeScript: types (canonical Bill, Item, Ownership, Participant), `calculateBill`, `calculateSession`, `simplifyTransfers`, `formatSummary`. No React, no I/O, independently testable — vitest tests cover the worked examples in the brief plus edge cases (zero GST, single participant, exact ties, residual rounding).
- **Integer cents throughout.** Parse dollars to cents at the input boundary, format back only for display. No floats in the engine.
- **Fixed allocation rules.** Service charge and GST each allocated pro rata on pre-tax item subtotal; largest-subtotal participant absorbs the rounding residual, with creation order as tie-break. Reconciliation asserts sum of shares equals bill total.
- **Deterministic netting.** Global session netting; greedy debtor/creditor match sorted by magnitude then creation order.
- **Structured breakdown.** The engine returns per-participant intermediate values (item lines, subtotal, charge allocations, rounding delta, total); the UI only renders them. No LLM anywhere.
- **State.** One session object in a React context/reducer, persisted to localStorage under a single key, hydrated after mount to avoid SSR mismatch. No backend, no Cloud.
- **Routes.** `/` (start), `/settle` as the stepper shell with `participants`, `bills`, `bills/$billId` (entry + ownership), and `result` leaves; each with its own head metadata. Buttons, inputs, sheets and steppers built on the existing shadcn primitives restyled by the token set.

## Out of scope for this build

OCR, AI, Telegram, share links, auth, payments, PayNow, permanent history, custom split/tax/rounding rules.
