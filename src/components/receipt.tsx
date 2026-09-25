import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/settlement";

export function Paper({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "receipt-paper shadow-[0_14px_30px_-18px_oklch(0_0_0/0.45)]",
        className,
      )}
    >
      <div className="px-5 py-7 sm:px-8">{children}</div>
    </div>
  );
}

export function PaperTitle({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="text-center">
      <h2 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
        {children}
      </h2>
      {subtitle ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{subtitle}</p>
      ) : null}
    </div>
  );
}

export function DashedRule({ className }: { className?: string }) {
  return (
    <div
      className={cn("my-4 border-t border-dashed border-paper-line", className)}
      aria-hidden
    />
  );
}

export function ColumnHeads({ cols }: { cols: string[] }) {
  return (
    <div className="flex items-end justify-between font-mono text-[0.65rem] uppercase tracking-[0.18em] text-ink-soft">
      {cols.map((c, i) => (
        <span key={c} className={i === cols.length - 1 ? "text-right" : ""}>
          {c}
        </span>
      ))}
    </div>
  );
}

export function Row({
  label,
  amount,
  strong,
  muted,
  note,
}: {
  label: ReactNode;
  amount: number | string;
  strong?: boolean;
  muted?: boolean;
  note?: ReactNode;
}) {
  return (
    <div className={cn("py-1", muted && "text-ink-soft")}>
      <div className="flex items-baseline">
        <span className={cn("min-w-0 text-sm", strong && "font-semibold")}>
          {label}
        </span>
        <span className="leader" aria-hidden />
        <span
          className={cn(
            "tabular shrink-0 text-sm",
            strong && "text-base font-semibold",
          )}
        >
          {typeof amount === "number" ? formatCents(amount) : amount}
        </span>
      </div>
      {note ? <div className="text-xs text-ink-soft">{note}</div> : null}
    </div>
  );
}

export function Stamp({
  children,
  tone = "good",
  className,
}: {
  children: ReactNode;
  tone?: "good" | "bad";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block -rotate-6 rounded-sm border-2 px-2 py-0.5 font-mono text-[0.7rem] font-bold uppercase tracking-[0.16em]",
        tone === "good" ? "border-rule text-rule" : "border-stamp text-stamp",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Perforated tear line across a slip. */
export function Perforation() {
  return (
    <div className="relative my-5 h-0" aria-hidden>
      <div className="border-t-2 border-dotted border-paper-line" />
    </div>
  );
}

export function Amount({
  cents,
  className,
}: {
  cents: number;
  className?: string;
}) {
  return <span className={cn("tabular", className)}>{formatCents(cents)}</span>;
}
