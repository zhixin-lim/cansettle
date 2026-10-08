import { describe, expect, it } from "vitest";

import { calculateBill, calculateSession, simplifyTransfers } from "./engine";
import { parseDollarsToCents, splitEvenly } from "./money";
import { formatSummary } from "./summary";
import type { Bill, Participant, Session } from "./types";

const people: Participant[] = [
  { id: "r", name: "Rachel", order: 0 },
  { id: "h", name: "Hannah", order: 1 },
  { id: "c", name: "Cherie", order: 2 },
  { id: "m", name: "Me", order: 3 },
];

function bill(partial: Partial<Bill>): Bill {
  return {
    id: "b1",
    merchant: "Test",
    payerId: "r",
    items: [],
    serviceChargeCents: 0,
    gstCents: 0,
    totalCents: 0,
    ...partial,
  };
}

describe("money", () => {
  it("parses dollars into integer cents", () => {
    expect(parseDollarsToCents("17.90")).toBe(1790);
    expect(parseDollarsToCents("$19.5")).toBe(1950);
    expect(parseDollarsToCents("10")).toBe(1000);
    expect(parseDollarsToCents("")).toBe(0);
  });

  it("splits remainder cents to the earliest parts", () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(1200, 3)).toEqual([400, 400, 400]);
  });
});

describe("shared item rounding", () => {
  it("gives the residual cent to the earliest participant in creation order", () => {
    const r = calculateBill(
      bill({
        items: [
          {
            id: "i1",
            name: "Cheesecake",
            qty: 1,
            unitPriceCents: 1000,
            ownerIds: ["c", "h", "r"], // deliberately out of order
          },
        ],
        totalCents: 1000,
      }),
      people,
    );
    const by = (id: string) => r.breakdowns.find((b) => b.participantId === id)!;
    expect(by("r").subtotalCents).toBe(334);
    expect(by("h").subtotalCents).toBe(333);
    expect(by("c").subtotalCents).toBe(333);
    expect(by("m").subtotalCents).toBe(0);
    expect(r.reconciles).toBe(true);
  });
});

describe("service charge and GST", () => {
  const dinner = bill({
    items: [
      { id: "i1", name: "Udon", qty: 1, unitPriceCents: 1790, ownerIds: ["r"] },
      { id: "i2", name: "Tomato Udon", qty: 1, unitPriceCents: 1950, ownerIds: ["h"] },
      { id: "i3", name: "Fries", qty: 1, unitPriceCents: 1000, ownerIds: ["r", "h"] },
    ],
    serviceChargeCents: 474,
    gstCents: 428,
    totalCents: 1790 + 1950 + 1000 + 474 + 428,
  });

  it("allocates proportionally and reconciles exactly", () => {
    const r = calculateBill(dinner, people);
    expect(r.reconciles).toBe(true);
    const sum = r.breakdowns.reduce((s, b) => s + b.totalCents, 0);
    expect(sum).toBe(r.billTotalCents);
  });

  it("never invents a charge that was not entered", () => {
    const r = calculateBill(
      bill({
        items: [
          { id: "i1", name: "Ice cream", qty: 2, unitPriceCents: 700, ownerIds: ["m"] },
        ],
        totalCents: 1400,
      }),
      people,
    );
    const me = r.breakdowns.find((b) => b.participantId === "m")!;
    expect(me.serviceChargeCents).toBe(0);
    expect(me.gstCents).toBe(0);
    expect(me.totalCents).toBe(1400);
  });

  it("flags a bill that does not tally instead of adjusting it", () => {
    const r = calculateBill(
      bill({
        items: [
          { id: "i1", name: "Thing", qty: 1, unitPriceCents: 11850, ownerIds: ["r"] },
        ],
        totalCents: 11950,
      }),
      people,
    );
    expect(r.reconciles).toBe(false);
    expect(r.differenceCents).toBe(-100);
  });

  it("reports unassigned items", () => {
    const r = calculateBill(
      bill({
        items: [{ id: "i1", name: "Fries", qty: 1, unitPriceCents: 1000, ownerIds: [] }],
        totalCents: 1000,
      }),
      people,
    );
    expect(r.unassignedItems).toEqual([{ itemId: "i1", itemName: "Fries" }]);
  });
});

describe("session netting", () => {
  const session: Session = {
    participants: people,
    bills: [
      bill({
        id: "b1",
        merchant: "Dinner",
        payerId: "r",
        items: [
          { id: "i1", name: "Mains", qty: 1, unitPriceCents: 9000, ownerIds: ["r", "h", "c", "m"] },
        ],
        serviceChargeCents: 900,
        gstCents: 810,
        totalCents: 10710,
      }),
      bill({
        id: "b2",
        merchant: "Dessert",
        payerId: "m",
        items: [
          { id: "i2", name: "Ice cream", qty: 4, unitPriceCents: 700, ownerIds: ["r", "h", "c", "m"] },
        ],
        totalCents: 2800,
      }),
    ],
  };

  it("nets globally across bills and balances to zero", () => {
    const res = calculateSession(session);
    expect(res.ready).toBe(true);
    const net = res.balances.reduce((s, b) => s + b.netCents, 0);
    expect(net).toBe(0);
    const moved = res.transfers.reduce((s, t) => s + t.amountCents, 0);
    const owed = res.balances
      .filter((b) => b.netCents < 0)
      .reduce((s, b) => s - b.netCents, 0);
    expect(moved).toBe(owed);
  });

  it("is deterministic for the same input", () => {
    const a = JSON.stringify(calculateSession(session).transfers);
    const b = JSON.stringify(calculateSession(session).transfers);
    expect(a).toBe(b);
  });

  it("blocks the settlement when a bill has no payer", () => {
    const res = calculateSession({
      ...session,
      bills: [{ ...session.bills[0]!, payerId: null }, session.bills[1]!],
    });
    expect(res.ready).toBe(false);
    expect(res.transfers).toEqual([]);
  });

  it("matches the worked example: Hannah and Me pay Rachel", () => {
    const transfers = simplifyTransfers(
      [
        { participantId: "r", paidCents: 12000, shareCents: 6000, netCents: 6000 },
        { participantId: "h", paidCents: 0, shareCents: 4500, netCents: -4500 },
        { participantId: "m", paidCents: 0, shareCents: 1500, netCents: -1500 },
      ],
      ["r", "h", "m"],
    );
    expect(transfers).toEqual([
      { fromId: "h", toId: "r", amountCents: 4500 },
      { fromId: "m", toId: "r", amountCents: 1500 },
    ]);
  });
});

describe("quantity assignments", () => {
  const plates = bill({
    items: [
      { id: "red", name: "Red plate", qty: 3, unitPriceCents: 300,
        ownerIds: [], ownerQuantities: { r: 1, h: 2 } },
      { id: "gold", name: "Gold plate", qty: 4, unitPriceCents: 500,
        ownerIds: [], ownerQuantities: { r: 2, h: 2 } },
    ],
    serviceChargeCents: 290, gstCents: 261, totalCents: 3451,
  });

  it("charges each person for their own plates and reconciles taxes", () => {
    const result = calculateBill(plates, people);
    expect(result.unassignedItems).toEqual([]);
    expect(result.breakdowns.find((b) => b.participantId === "r")?.subtotalCents).toBe(1300);
    expect(result.breakdowns.find((b) => b.participantId === "h")?.subtotalCents).toBe(1600);
    expect(result.breakdowns.reduce((sum, b) => sum + b.totalCents, 0)).toBe(3451);
    const session = { participants: people, bills: [plates] };
    const calculated = calculateSession(session);
    expect(calculated.ready).toBe(true);
    const summary = formatSummary(session, {
      ok: true,
      balances: calculated.balances,
      transfers: calculated.transfers.map((t) => ({ from: t.fromId, to: t.toId, amountCents: t.amountCents })),
      billResults: calculated.billResults.map((r) => ({
        billId: r.billId,
        shares: r.breakdowns.map((b) => ({
          participantId: b.participantId,
          itemCents: b.subtotalCents,
          serviceChargeCents: b.serviceChargeCents,
          gstCents: b.gstCents,
          totalCents: b.totalCents,
        })),
        itemSubtotalCents: r.itemsSubtotalCents,
        reconciledTotalCents: r.calculatedTotalCents,
        expectedTotalCents: r.billTotalCents,
        reconciled: r.reconciles,
      })),
    });
    expect(summary).toContain("1x Red plate: $3.00");
    expect(summary).toContain("2x Red plate: $6.00");
    expect(summary).toContain("2x Gold plate: $10.00");
    expect(summary).toContain("React 🫡 once settled.");
    expect(summary).not.toContain("Can settle already");
  });

  it.each([
    [{ r: 1, h: 1 }, "1 still to assign"],
    [{ r: 2, h: 2 }, "1 too many assigned"],
    [{ r: 1.5, h: 1.5 }, "Invalid quantity assignment"],
    [{ r: 1, missing: 2 }, "Invalid quantity assignment"],
    [{ r: -1, h: 4 }, "Invalid quantity assignment"],
  ])("blocks invalid assignments without silently sharing", (quantities, reason) => {
    const first = plates.items[0];
    if (!first) throw new Error("Missing test plate");
    const invalid = { ...plates, items: [{ ...first, ownerQuantities: quantities }] };
    const result = calculateSession({ participants: people, bills: [invalid] });
    expect(result.ready).toBe(false);
    expect(result.transfers).toEqual([]);
    expect(result.billResults[0]?.unassignedItems[0]?.reason).toBe(reason);
    expect(result.billResults[0]?.breakdowns.every((b) => b.items.length === 0)).toBe(true);
  });
});
