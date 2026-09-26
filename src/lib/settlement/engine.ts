import { splitEvenly } from "./money";
import type {
  Bill,
  BillResult,
  ItemLine,
  NetBalance,
  Participant,
  ParticipantBillBreakdown,
  Session,
  SessionResult,
  Transfer,
} from "./types";

/* ------------------------------------------------------------------ utils */

export function lineTotalCents(qty: number, unitPriceCents: number): number {
  return Math.round(qty * unitPriceCents);
}

function sortedParticipants(participants: Participant[]): Participant[] {
  return [...participants].sort((a, b) => a.order - b.order);
}

/**
 * Allocate `amount` cents across participants in proportion to `weights`
 * (each participant's pre-tax subtotal).
 *
 * Any rounding residual goes entirely to the participant with the largest
 * weight; ties break on participant creation order. Returns per-participant
 * allocation plus the residual each absorbed.
 */
export function allocateProRata(
  amount: number,
  order: string[],
  weights: Record<string, number>,
): { allocation: Record<string, number>; residual: Record<string, number> } {
  const allocation: Record<string, number> = {};
  const residual: Record<string, number> = {};
  for (const id of order) {
    allocation[id] = 0;
    residual[id] = 0;
  }
  if (order.length === 0 || amount === 0) return { allocation, residual };

  const totalWeight = order.reduce((sum, id) => sum + (weights[id] ?? 0), 0);

  if (totalWeight <= 0) {
    // No pre-tax basis to allocate on (e.g. a charge on a zero-value bill):
    // fall back to an even, deterministic split.
    const parts = splitEvenly(amount, order.length);
    order.forEach((id, i) => {
      allocation[id] = parts[i];
    });
    return { allocation, residual };
  }

  let assigned = 0;
  for (const id of order) {
    const part = Math.trunc((amount * (weights[id] ?? 0)) / totalWeight);
    allocation[id] = part;
    assigned += part;
  }

  const leftover = amount - assigned;
  if (leftover !== 0) {
    // Largest pre-tax share absorbs the residual; creation order breaks ties.
    let winner = order[0];
    for (const id of order) {
      if ((weights[id] ?? 0) > (weights[winner] ?? 0)) winner = id;
    }
    allocation[winner] += leftover;
    residual[winner] += leftover;
  }

  return { allocation, residual };
}

/* --------------------------------------------------------------- one bill */

export function calculateBill(bill: Bill, participants: Participant[]): BillResult {
  const ordered = sortedParticipants(participants);
  const order = ordered.map((p) => p.id);
  const indexOf = new Map(order.map((id, i) => [id, i]));

  const unassignedItems = bill.items
    .filter((item) => item.ownerIds.filter((id) => indexOf.has(id)).length === 0)
    .map((item) => ({ itemId: item.id, itemName: item.name }));

  const lines: Record<string, ItemLine[]> = {};
  const subtotals: Record<string, number> = {};
  for (const id of order) {
    lines[id] = [];
    subtotals[id] = 0;
  }

  let itemsSubtotalCents = 0;

  for (const item of bill.items) {
    const total = lineTotalCents(item.qty, item.unitPriceCents);
    itemsSubtotalCents += total;

    // Keep owners in participant creation order so the remainder cents of a
    // shared item always land on the same people for the same input.
    const owners = order.filter((id) => item.ownerIds.includes(id));
    if (owners.length === 0) continue;

    const parts = splitEvenly(total, owners.length);
    owners.forEach((id, i) => {
      lines[id].push({
        itemId: item.id,
        itemName: item.name,
        lineTotalCents: total,
        sharedWays: owners.length,
        shareCents: parts[i],
      });
      subtotals[id] += parts[i];
    });
  }

  const service = allocateProRata(bill.serviceChargeCents, order, subtotals);
  const gst = allocateProRata(bill.gstCents, order, subtotals);

  const breakdowns: ParticipantBillBreakdown[] = ordered.map((p) => {
    const subtotal = subtotals[p.id] ?? 0;
    const sc = service.allocation[p.id] ?? 0;
    const g = gst.allocation[p.id] ?? 0;
    return {
      participantId: p.id,
      items: lines[p.id] ?? [],
      subtotalCents: subtotal,
      serviceChargeCents: sc,
      gstCents: g,
      roundingCents: (service.residual[p.id] ?? 0) + (gst.residual[p.id] ?? 0),
      totalCents: subtotal + sc + g,
    };
  });

  const calculatedTotalCents =
    itemsSubtotalCents + bill.serviceChargeCents + bill.gstCents;
  const differenceCents = calculatedTotalCents - bill.totalCents;

  return {
    billId: bill.id,
    breakdowns,
    itemsSubtotalCents,
    serviceChargeCents: bill.serviceChargeCents,
    gstCents: bill.gstCents,
    calculatedTotalCents,
    billTotalCents: bill.totalCents,
    reconciles: differenceCents === 0,
    differenceCents,
    unassignedItems,
  };
}

/* ------------------------------------------------------------- settlement */

/**
 * Deterministic greedy debtor/creditor matching.
 * Same inputs always produce the same transfers.
 */
export function simplifyTransfers(
  balances: NetBalance[],
  order: string[],
): Transfer[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const byRank = (a: { id: string }, b: { id: string }) =>
    (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);

  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ id: b.participantId, amount: b.netCents }));
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ id: b.participantId, amount: -b.netCents }));

  const transfers: Transfer[] = [];
  let guard = 0;

  while (creditors.length > 0 && debtors.length > 0 && guard++ < 1000) {
    creditors.sort((a, b) => b.amount - a.amount || byRank(a, b));
    debtors.sort((a, b) => b.amount - a.amount || byRank(a, b));

    const creditor = creditors[0]!;
    const debtor = debtors[0]!;
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      transfers.push({ fromId: debtor.id, toId: creditor.id, amountCents: amount });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) creditors.shift();
    if (debtor.amount === 0) debtors.splice(debtors.indexOf(debtor), 1);
  }

  return transfers;
}

export function calculateSession(session: Session): SessionResult {
  const ordered = sortedParticipants(session.participants);
  const order = ordered.map((p) => p.id);

  const billResults = session.bills.map((bill) => calculateBill(bill, ordered));

  const paid: Record<string, number> = {};
  const share: Record<string, number> = {};
  for (const id of order) {
    paid[id] = 0;
    share[id] = 0;
  }

  session.bills.forEach((bill, i) => {
    const payerId = bill.payerId;
    if (payerId && paid[payerId] !== undefined) {
      paid[payerId] = (paid[payerId] ?? 0) + bill.totalCents;
    }
    for (const b of billResults[i]?.breakdowns ?? []) {
      share[b.participantId] = (share[b.participantId] ?? 0) + b.totalCents;
    }
  });

  const balances: NetBalance[] = ordered.map((p) => ({
    participantId: p.id,
    paidCents: paid[p.id] ?? 0,
    shareCents: share[p.id] ?? 0,
    netCents: (paid[p.id] ?? 0) - (share[p.id] ?? 0),
  }));

  const ready =
    session.bills.length > 0 &&
    billResults.every((r) => r.reconciles && r.unassignedItems.length === 0) &&
    session.bills.every((b) => b.payerId !== null);

  return {
    billResults,
    balances,
    transfers: ready ? simplifyTransfers(balances, order) : [],
    ready,
    grandTotalCents: session.bills.reduce((sum, b) => sum + b.totalCents, 0),
  };
}
