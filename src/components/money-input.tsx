import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { centsToDollarString, parseDollarsToCents } from "@/lib/settlement";

/**
 * Dollar-and-cents text field. Keeps its own text while typing so "17.9" and
 * "17.90" both behave, and reports integer cents upward on every change.
 */
export function MoneyInput({
  valueCents,
  onChangeCents,
  className,
  placeholder = "0.00",
  "aria-label": ariaLabel,
}: {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(() =>
    valueCents === 0 ? "" : centsToDollarString(valueCents),
  );
  const focused = useRef(false);

  // Follow outside changes (e.g. the auto 10% / 9% fill) unless mid-edit.
  useEffect(() => {
    if (!focused.current) {
      setText(valueCents === 0 ? "" : centsToDollarString(valueCents));
    }
  }, [valueCents]);

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-sm text-ink-soft">
        $
      </span>
      <input
        aria-label={ariaLabel}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9.]/g, "").slice(0, 10);
          setText(next);
          onChangeCents(parseDollarsToCents(next));
        }}
        onBlur={() => {
          focused.current = false;
          const cents = parseDollarsToCents(text);
          setText(cents === 0 && text.trim() === "" ? "" : centsToDollarString(cents));
        }}
        className="tabular w-full rounded-sm border border-input bg-transparent py-1.5 pl-6 pr-2 text-right text-sm outline-hidden focus:border-rule focus:ring-1 focus:ring-rule"
      />
    </div>
  );
}
