import { dhakaDayRange, dhakaWeekRange, type IsoRange } from './dhaka-time';

export interface LowStockRow {
  id: number;
  product_id: number;
  variant_title: string;
  stock: number;
  title: string;
  title_bn: string | null;
}

export interface AdminDashboardData {
  todayOrders: number;
  pendingOrders: number;
  weekRevenue: number;
  lowStockCount: number;
  lowStock: LowStockRow[];
  today: IsoRange;
  week: IsoRange;
}

export const LOW_STOCK_THRESHOLD = 5;
export const LOW_STOCK_LIMIT = 10;

export interface DashboardQuery {
  label: string;
  sql: string;
  bindings: unknown[];
}

export function buildAdminDashboardQueries(now: Date): {
  queries: DashboardQuery[];
  today: IsoRange;
  week: IsoRange;
} {
  const today = dhakaDayRange(now);
  const week = dhakaWeekRange(now);

  return {
    today,
    week,
    queries: [
      {
        label: 'today_orders',
        sql: 'SELECT COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < ?',
        bindings: [today.startIso, today.endIso],
      },
      {
        label: 'pending_orders',
        sql: "SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'",
        bindings: [],
      },
      {
        label: 'week_revenue',
        sql: `SELECT COALESCE(SUM(total), 0) AS revenue
                FROM orders
               WHERE created_at >= ? AND created_at < ?
                 AND status NOT IN ('cancelled', 'returned')
                 AND payment_status <> 'refunded'`,
        bindings: [week.startIso, week.endIso],
      },
      {
        label: 'low_stock_count',
        sql: `SELECT COUNT(*) AS count
                FROM variants v INDEXED BY idx_variants_stock
                JOIN products p ON p.id = v.product_id
               WHERE v.active = 1
                 AND v.stock <= ?
                 AND p.track_stock = 1
                 AND p.status = 'active'`,
        bindings: [LOW_STOCK_THRESHOLD],
      },
      {
        label: 'low_stock',
        sql: `SELECT v.id, v.product_id, v.title AS variant_title, v.stock,
                     p.title, p.title_bn
                FROM variants v INDEXED BY idx_variants_stock
                JOIN products p ON p.id = v.product_id
               WHERE v.active = 1
                 AND v.stock <= ?
                 AND p.track_stock = 1
                 AND p.status = 'active'
               ORDER BY v.stock, v.id
               LIMIT ?`,
        bindings: [LOW_STOCK_THRESHOLD, LOW_STOCK_LIMIT],
      },
    ],
  };
}

/** One D1 round trip: four indexed KPI statements in a read-only batch. */
export async function loadAdminDashboard(
  db: D1Database,
  now: Date = new Date(),
): Promise<AdminDashboardData> {
  const { queries, today, week } = buildAdminDashboardQueries(now);
  const results = await db.batch(
    queries.map((query) => db.prepare(query.sql).bind(...query.bindings)),
  );

  return {
    todayOrders: Number((results[0]?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
    pendingOrders: Number(
      (results[1]?.results?.[0] as { count?: number } | undefined)?.count ?? 0,
    ),
    weekRevenue: Number(
      (results[2]?.results?.[0] as { revenue?: number } | undefined)?.revenue ?? 0,
    ),
    lowStockCount: Number(
      (results[3]?.results?.[0] as { count?: number } | undefined)?.count ?? 0,
    ),
    lowStock: (results[4]?.results ?? []) as LowStockRow[],
    today,
    week,
  };
}
