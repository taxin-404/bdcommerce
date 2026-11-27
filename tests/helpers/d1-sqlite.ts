import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function d1Unavailable(): Error {
  return new Error('D1_ERROR: Network connection lost');
}

interface SqliteRunResult {
  changes: number;
  last_row_id: number;
}

export class TestD1 {
  unavailable = false;
  failWhenSqlIncludes: string | null = null;
  failStatementIncludes: string | null = null;
  failStatementMessage = 'D1_ERROR: UNIQUE constraint failed: orders.number: SQLITE_CONSTRAINT';
  roundTrips = 0;
  maxParams = 0;

  constructor(readonly sqlite: DatabaseSync) {}

  prepare(sql: string): D1PreparedStatement {
    if (this.unavailable) throw d1Unavailable();
    return new TestStatement(this, sql) as unknown as D1PreparedStatement;
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    if (this.unavailable) throw d1Unavailable();
    this.roundTrips += 1;

    const prepared = statements as unknown as TestStatement[];
    if (
      this.failWhenSqlIncludes &&
      prepared.some((statement) => statement.sql.includes(this.failWhenSqlIncludes as string))
    ) {
      throw d1Unavailable();
    }

    this.sqlite.exec('BEGIN');
    try {
      const results = prepared.map((statement) => statement.execute());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message.startsWith('D1_ERROR:') ? message : `D1_ERROR: ${message}`);
    }
  }

  async exec(sql: string): Promise<D1ExecResult> {
    if (this.unavailable) throw d1Unavailable();
    this.roundTrips += 1;
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }

  meta(): SqliteRunResult {
    return this.sqlite
      .prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id')
      .get() as unknown as SqliteRunResult;
  }
}

class TestStatement {
  constructor(
    private readonly owner: TestD1,
    readonly sql: string,
    private readonly params: unknown[] = [],
  ) {
    this.owner.maxParams = Math.max(this.owner.maxParams, params.length);
  }

  bind(...params: unknown[]): D1PreparedStatement {
    return new TestStatement(this.owner, this.sql, params) as unknown as D1PreparedStatement;
  }

  async first<T>(column?: string): Promise<T | null> {
    this.owner.roundTrips += 1;
    const rows = this.owner.sqlite.prepare(this.sql).all(...(this.params as never[])) as Array<
      Record<string, unknown>
    >;
    const row = rows[0];
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T>(): Promise<D1Result<T>> {
    this.owner.roundTrips += 1;
    const results = this.owner.sqlite.prepare(this.sql).all(...(this.params as never[])) as T[];
    return {
      success: true,
      results,
      meta: this.owner.meta() as unknown as D1Meta & Record<string, unknown>,
    };
  }

  async run<T>(): Promise<D1Result<T>> {
    this.owner.roundTrips += 1;
    this.owner.sqlite.prepare(this.sql).run(...(this.params as never[]));
    return {
      success: true,
      results: [],
      meta: this.owner.meta() as unknown as D1Meta & Record<string, unknown>,
    };
  }

  /** Batch execution keeps rows for RETURNING statements and still reports meta. */
  execute(): D1Result {
    if (this.owner.failStatementIncludes && this.sql.includes(this.owner.failStatementIncludes)) {
      const message = this.owner.failStatementMessage;
      this.owner.failStatementIncludes = null;
      throw new Error(message);
    }

    const results = this.owner.sqlite.prepare(this.sql).all(...(this.params as never[])) as unknown[];
    return {
      success: true,
      results,
      meta: this.owner.meta() as unknown as D1Meta & Record<string, unknown>,
    };
  }
}

export function applyMigrations(sqlite: DatabaseSync): void {
  const directory = join(process.cwd(), 'migrations');
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of files) {
    sqlite.exec(readFileSync(join(directory, file), 'utf8'));
  }
}

export interface TestEnvironment {
  sqlite: DatabaseSync;
  adapter: TestD1;
  db: D1Database;
  close: () => void;
}

export function createTestDb(): TestEnvironment {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const adapter = new TestD1(sqlite);
  return {
    sqlite,
    adapter,
    db: adapter as unknown as D1Database,
    close: () => sqlite.close(),
  };
}

export interface VariantFixture {
  id: number;
  title?: string;
  options?: Record<string, string>;
  price?: number | null;
  stock?: number;
  active?: boolean;
  sku?: string | null;
}

export function insertProduct(
  sqlite: DatabaseSync,
  product: {
    id: number;
    slug?: string;
    title?: string;
    titleBn?: string | null;
    price: number;
    trackStock?: boolean;
    status?: 'draft' | 'active' | 'archived';
    variants?: VariantFixture[];
  },
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO products (id, slug, title, title_bn, description, category_id, price,
         compare_at_price, status, track_stock, attributes, featured, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?, NULL, 0, ?, ?)`,
    )
    .run(
      product.id,
      product.slug ?? `product-${product.id}`,
      product.title ?? `Product ${product.id}`,
      product.titleBn ?? null,
      product.price,
      product.status ?? 'active',
      product.trackStock === false ? 0 : 1,
      now,
      now,
    );

  for (const variant of product.variants ?? []) {
    sqlite
      .prepare(
        `INSERT INTO variants (id, product_id, sku, title, options, price, stock, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        variant.id,
        product.id,
        variant.sku ?? null,
        variant.title ?? `Variant ${variant.id}`,
        variant.options ? JSON.stringify(variant.options) : null,
        variant.price ?? null,
        variant.stock ?? 0,
        variant.active === false ? 0 : 1,
      );
  }
}

export function insertSetting(sqlite: DatabaseSync, key: string, value: unknown): void {
  sqlite
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, JSON.stringify(value));
}

export function countRows(sqlite: DatabaseSync, table: string): number {
  const row = sqlite
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .get() as unknown as { count: number };
  return row.count;
}
