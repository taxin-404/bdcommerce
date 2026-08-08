export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function parsePage(query: URLSearchParams, defaultSize = 24): { page: number; pageSize: number } {
  const page = Math.max(1, parseInt(query.get("page") ?? "1", 10) || 1);
  const rawSize = parseInt(query.get("pageSize") ?? String(defaultSize), 10);
  const pageSize = Math.min(100, Math.max(1, rawSize || defaultSize));
  return { page, pageSize };
}

export function paginate<T>(items: T[], page: number, pageSize: number, total?: number): Paginated<T> {
  const t = total ?? items.length;
  return {
    items,
    total: t,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(t / pageSize)),
  };
}
