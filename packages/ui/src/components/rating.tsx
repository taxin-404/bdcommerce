import { Star, StarHalf } from "lucide-react";
import { cn } from "../utils";

export function Rating({
  value,
  count,
  size = 14,
  className,
  showValue = true,
}: {
  value: number;
  count?: number;
  size?: number;
  className?: string;
  showValue?: boolean;
}) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    if (value >= i) {
      stars.push(<Star key={i} size={size} className="fill-amber-400 text-amber-400" />);
    } else if (value >= i - 0.5) {
      stars.push(
        <span key={i} className="relative inline-flex">
          <Star size={size} className="text-muted-foreground/40" />
          <StarHalf size={size} className="absolute inset-0 fill-amber-400 text-amber-400" />
        </span>,
      );
    } else {
      stars.push(<Star key={i} size={size} className="text-muted-foreground/40" />);
    }
  }
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="flex items-center gap-0.5">{stars}</span>
      {showValue ? <span className="text-xs text-muted-foreground">{value > 0 ? value.toFixed(1) : "—"}</span> : null}
      {count != null ? <span className="text-xs text-muted-foreground">({count})</span> : null}
    </span>
  );
}
