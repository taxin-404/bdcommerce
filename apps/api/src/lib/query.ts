import { asc, desc, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { parsePage, type Paginated } from "@bd/core";

export function paginationFromQuery(query: URLSearchParams, defaultSize = 24) {
  return parsePage(query, defaultSize);
}

export function orderByClause<T extends Record<string, SQLiteColumn>>(
  query: URLSearchParams,
  columns: T,
  defaultSort: { column: SQLiteColumn; dir: "asc" | "desc" },
): SQL[] {
  const sort = query.get("sort");
  if (!sort) return defaultSort.dir === "desc" ? [desc(defaultSort.column)] : [asc(defaultSort.column)];
  const [field, dir] = sort.split(":");
  const column = columns[field ?? ""];
  if (!column) return defaultSort.dir === "desc" ? [desc(defaultSort.column)] : [asc(defaultSort.column)];
  return dir === "asc" ? [asc(column)] : [desc(column)];
}

export function paginated<T>(items: T[], page: number, pageSize: number, total: number): Paginated<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Escape LIKE wildcards so user search terms don't behave like patterns
export function likeTerm(term: string): string {
  return `%${term.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
}
