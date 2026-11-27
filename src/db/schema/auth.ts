import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    id: integer('id').primaryKey(),
    ipHash: text('ip_hash').notNull(),
    attemptedAt: text('attempted_at').notNull(),
  },
  (table) => [
    index('idx_login_attempts_ip_time').on(table.ipHash, table.attemptedAt),
  ],
);
