import * as React from "react";
import { cn } from "../utils";

export function formatBDT(paisa: number): string {
  const amount = paisa / 100;
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(amount);
}

export function Price({
  paisa,
  compareAt,
  className,
  compareClassName,
}: {
  paisa: number;
  compareAt?: number | null;
  className?: string;
  compareClassName?: string;
}) {
  const isDiscounted = compareAt != null && compareAt > paisa;
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span className="font-semibold">{formatBDT(paisa)}</span>
      {isDiscounted ? <span className={cn("text-sm text-muted-foreground line-through", compareClassName)}>{formatBDT(compareAt!)}</span> : null}
    </span>
  );
}

export function discountPct(paisa: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= paisa || paisa <= 0) return null;
  return Math.round(((compareAt - paisa) / compareAt) * 100);
}
