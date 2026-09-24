/** Money helpers. Everything internal is integer cents. */

/** Parse a user-typed dollar string ("17.90", "$17.9", "") into cents. */
export function parseDollarsToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const negative = cleaned.startsWith("-");
  const [whole = "0", frac = ""] = cleaned.replace("-", "").split(".");
  const cents =
    Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2).padEnd(2, "0"));
  if (!Number.isFinite(cents)) return 0;
  return negative ? -Math.round(cents) : Math.round(cents);
}

/** 1790 -> "17.90" */
export function centsToDollarString(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const out = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${out}` : out;
}

/** 1790 -> "$17.90" */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  return `${negative ? "-" : ""}$${centsToDollarString(Math.abs(cents))}`;
}

/**
 * Split `amount` cents into `count` parts as evenly as possible.
 * Remainder cents go to the earliest parts, so the result is deterministic.
 */
export function splitEvenly(amount: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.trunc(amount / count);
  let remainder = amount - base * count;
  const step = remainder >= 0 ? 1 : -1;
  const parts = new Array<number>(count).fill(base);
  let i = 0;
  while (remainder !== 0) {
    parts[i] += step;
    remainder -= step;
    i = (i + 1) % count;
  }
  return parts;
}
