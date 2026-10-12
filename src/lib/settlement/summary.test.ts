import { describe, expect, it } from "vitest";

import { calculateSession } from "./engine";
import {
  formatPersonalMessage,
  formatSummary,
  personalMessageRecipients,
  type OkSettlement,
} from "./summary";
import type { Bill, Participant, Session } from "./types";

const people: Participant[] = [
  { id: "s", name: "Sarah", order: 0, phone: "9048 7510" },
  { id: "r", name: "Rachel", order: 1 },
  { id: "h", name: "Hannah", order: 2 },
];

const dinner: Bill = {
  id: "b1",
  merchant: "Otter & Pebbles",
  payerId: "s",
  items: [
    { id: "i1", name: "Udon", qty: 1, unitPriceCents: 2000, ownerIds: ["s"] },
    { id: "i2", name: "Ochazuke", qty: 1, unitPriceCents: 1500, ownerIds: ["r"] },
    { id: "i3", name: "Cheesecake", qty: 1, unitPriceCents: 1000, ownerIds: ["r", "h"] },
  ],
  serviceChargeCents: 450,
  gstCents: 413,
  totalCents: 5363,
};

function settle(session: Session): OkSettlement {
  const c = calculateSession(session);
  expect(c.ready).toBe(true);
  return {
    ok: true,
    balances: c.balances,
    transfers: c.transfers.map((t) => ({ from: t.fromId, to: t.toId, amountCents: t.amountCents })),
    billResults: c.billResults.map((r) => ({
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
  };
}

const session: Session = { participants: people, bills: [dinner] };
const result = settle(session);

describe("share messages are plain text", () => {
  it("uses no markdown formatting symbols in either message", () => {
    const messages = [formatSummary(session, result)];
    for (const id of personalMessageRecipients(result)) {
      messages.push(formatPersonalMessage(session, result, id)!);
    }
    for (const m of messages) {
      expect(m).not.toMatch(/[*_`#>|]/);
    }
  });
});

describe("group message", () => {
  const text = formatSummary(session, result);

  it("is short: item names per person, no per-item amounts", () => {
    expect(text).toContain("🧾 Otter & Pebbles — $53.63 (paid by Sarah)");
    expect(text).toContain("Rachel —");
    expect(text).toContain("Ochazuke, Cheesecake");
    expect(text).not.toContain("Ochazuke —");
    expect(text).not.toContain("GST:");
  });

  it("says who pays whom, with the payee's PayNow number", () => {
    expect(text).toContain("Who pays whom:");
    expect(text).toMatch(/Rachel → Sarah \$\d+\.\d\d — PayNow 9048 7510/);
    expect(text).toContain("React 🫡 once settled.");
  });

  it("mentions that service charge and GST are included", () => {
    expect(text).toContain("Service charge and GST are already included");
  });
});

describe("personal message", () => {
  it("lists a person's items with amounts, their share and who to pay", () => {
    const text = formatPersonalMessage(session, result, "r")!;
    expect(text.startsWith("Eh Rachel, you owe Sarah $")).toBe(true);
    expect(text).toContain("for Otter & Pebbles 🧾");
    expect(text).toContain("Ochazuke — $15.00");
    expect(text).toContain("Cheesecake (shared 2 ways) — $5.00");
    expect(text).toContain("Service charge + GST —");
    expect(text).toContain("PayNow to Sarah — 9048 7510");
  });

  it("returns null for someone who owes nothing", () => {
    expect(formatPersonalMessage(session, result, "s")).toBeNull();
    expect(personalMessageRecipients(result)).toEqual(["r", "h"]);
  });

  it("lists every payee when someone owes more than one person", () => {
    const hotpot: Bill = {
      id: "b2",
      merchant: "",
      payerId: "r",
      items: [
        { id: "j1", name: "Hotpot", qty: 1, unitPriceCents: 3000, ownerIds: ["s", "r", "h"] },
      ],
      serviceChargeCents: 0,
      gstCents: 0,
      totalCents: 3000,
    };
    const two: Session = { participants: people, bills: [dinner, hotpot] };
    const res = settle(two);
    const owing = personalMessageRecipients(res);
    for (const id of owing) {
      const msg = formatPersonalMessage(two, res, id)!;
      const payees = res.transfers.filter((t) => t.from === id);
      if (payees.length > 1) expect(msg).toContain("Please pay:");
      expect(msg).toContain("Otter & Pebbles:");
    }
  });
});
