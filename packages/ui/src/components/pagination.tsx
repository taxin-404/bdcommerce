import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "../utils";
import { Button } from "./button";

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function Pagination({
  state,
  onPageChange,
  className,
}: {
  state: PaginationState;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const { page, totalPages } = state;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const pages = React.useMemo(() => {
    const set = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    return [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  }, [page, totalPages]);

  return (
    <nav className={cn("flex items-center gap-1", className)} aria-label="Pagination">
      <Button variant="outline" size="icon" disabled={!canPrev} onClick={() => onPageChange(1)} aria-label="First page">
        <ChevronsLeft />
      </Button>
      <Button variant="outline" size="icon" disabled={!canPrev} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
        <ChevronLeft />
      </Button>
      {pages.map((p, i) => {
        const prev = pages[i - 1];
        return (
          <React.Fragment key={p}>
            {prev != null && p - prev > 1 ? <span className="px-1 text-muted-foreground">…</span> : null}
            <Button
              variant={p === page ? "default" : "outline"}
              size="icon"
              className="h-9 w-9"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </Button>
          </React.Fragment>
        );
      })}
      <Button variant="outline" size="icon" disabled={!canNext} onClick={() => onPageChange(page + 1)} aria-label="Next page">
        <ChevronRight />
      </Button>
      <Button variant="outline" size="icon" disabled={!canNext} onClick={() => onPageChange(totalPages)} aria-label="Last page">
        <ChevronsRight />
      </Button>
    </nav>
  );
}
