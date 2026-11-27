import { parseDhakaDate } from './dhaka-time';
import { ORDER_STATUSES, type OrderStatus } from './order-status';
import { normalizePhone } from './phone';

export const ADMIN_ORDERS_PAGE_SIZE = 50;

export interface AdminOrderListRow {
  id: number;
  number: string;
  status: OrderStatus;
  customer_name: string;
  phone: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
}

export interface AdminOrderListFilters {
  status: OrderStatus | null;
  phone: string | null;
  createdFrom: string | null;
  createdBefore: string | null;
}

export type OrderFilterError =
  | 'invalid_status'
  | 'invalid_phone'
  | 'invalid_date'
  | 'invalid_range';

export interface ParsedOrderListFilters extends AdminOrderListFilters {
  fromDate: string | null;
  toDate: string | null;
  errors: OrderFilterError[];
}

export interface OrderListCursor {
  createdAt: string;
  id: number;
}

const LIST_COLUMNS = `id, number, status, customer_name, phone, subtotal, shipping_fee,
  total, payment_method, payment_status, created_at`;

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function parseOrderListFilters(input: {
  status?: string | null;
  phone?: string | null;
  from?: string | null;
  to?: string | null;
}): ParsedOrderListFilters {
  const errors: OrderFilterError[] = [];

  const rawStatus = clean(input.status);
  let status: OrderStatus | null = null;
  if (rawStatus) {
    if (ORDER_STATUSES.includes(rawStatus as OrderStatus)) {
      status = rawStatus as OrderStatus;
    } else {
      errors.push('invalid_status');
    }
  }

  const rawPhone = clean(input.phone);
  let phone: string | null = null;
  if (rawPhone) {
    phone = normalizePhone(rawPhone);
    if (!phone) errors.push('invalid_phone');
  }

  const rawFrom = clean(input.from);
  const rawTo = clean(input.to);
  const fromDate = rawFrom || null;
  const toDate = rawTo || null;
  let createdFrom: string | null = null;
  let createdBefore: string | null = null;

  if (fromDate) {
    const range = parseDhakaDate(fromDate);
    if (range) createdFrom = range.startIso;
    else errors.push('invalid_date');
  }
  if (toDate) {
    const range = parseDhakaDate(toDate);
    if (range) createdBefore = range.endIso;
    else errors.push('invalid_date');
  }

  if (createdFrom && createdBefore && createdFrom >= createdBefore) {
    errors.push('invalid_range');
    createdFrom = null;
    createdBefore = null;
  }

  return { status, phone, createdFrom, createdBefore, fromDate, toDate, errors };
}

export function encodeOrderCursor(row: { created_at: string; id: number }): string {
  const payload = JSON.stringify({ t: row.created_at, i: row.id });
  return btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeOrderCursor(value: string | null | undefined): OrderListCursor | null {
  if (!value) return null;

  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(padded)) as { t?: unknown; i?: unknown };
    if (typeof parsed.t !== 'string' || typeof parsed.i !== 'number') return null;
    if (!Number.isSafeInteger(parsed.i) || parsed.i <= 0) return null;
    if (Number.isNaN(Date.parse(parsed.t))) return null;
    return { createdAt: parsed.t, id: parsed.i };
  } catch {
    return null;
  }
}

export function buildAdminOrderListQuery(
  filters: AdminOrderListFilters,
  cursor: OrderListCursor | null,
  limit: number,
): { sql: string; bindings: unknown[] } {
  const where: string[] = [];
  const bindings: unknown[] = [];

  if (filters.phone) {
    where.push('phone = ?');
    bindings.push(filters.phone);
  }
  if (filters.status) {
    where.push('status = ?');
    bindings.push(filters.status);
  }
  if (filters.createdFrom) {
    where.push('created_at >= ?');
    bindings.push(filters.createdFrom);
  }
  if (filters.createdBefore) {
    where.push('created_at < ?');
    bindings.push(filters.createdBefore);
  }
  // A far-future upper bound keeps the first page an index range search too,
  // instead of letting SQLite report a whole-index SCAN for an unfiltered list.
  const pageCursor = cursor ?? {
    createdAt: '9999-12-31T23:59:59.999Z',
    id: Number.MAX_SAFE_INTEGER,
  };
  where.push('(created_at, id) < (?, ?)');
  bindings.push(pageCursor.createdAt, pageCursor.id);

  const index = filters.phone
    ? filters.status
      ? 'idx_orders_phone_status_created_id'
      : 'idx_orders_phone_created_id'
    : filters.status
      ? 'idx_orders_status_created_id'
      : 'idx_orders_created_id';

  const sql = `SELECT ${LIST_COLUMNS}
                 FROM orders INDEXED BY ${index}
                ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY created_at DESC, id DESC
                LIMIT ?`;
  bindings.push(limit + 1);

  return { sql, bindings };
}

export async function listAdminOrders(input: {
  db: D1Database;
  filters: AdminOrderListFilters;
  cursor: OrderListCursor | null;
  limit?: number;
}): Promise<{ orders: AdminOrderListRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? ADMIN_ORDERS_PAGE_SIZE, 1), 100);
  const { sql, bindings } = buildAdminOrderListQuery(input.filters, input.cursor, limit);
  const { results } = await input.db
    .prepare(sql)
    .bind(...bindings)
    .all<AdminOrderListRow>();

  const hasMore = results.length > limit;
  const orders = hasMore ? results.slice(0, limit) : results;
  const last = orders[orders.length - 1];

  return {
    orders,
    nextCursor: hasMore && last ? encodeOrderCursor(last) : null,
  };
}
