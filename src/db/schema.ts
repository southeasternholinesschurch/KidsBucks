import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * KidsBucks. See migrations/0000_initial.sql for why this differs from the
 * four-child app it grew out of.
 */

export const ROLES = ['admin', 'leader'] as const;
export const REASONS = ['award', 'spend', 'correction'] as const;
export type Role = (typeof ROLES)[number];
export type Reason = (typeof REASONS)[number];

export const leaders = sqliteTable('leaders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  pinHash: text('pin_hash').notNull(),
  role: text('role', { enum: ROLES }).notNull().default('leader'),
  active: integer('active').notNull().default(1),
  /** Wrong guesses since the last success, and the lockout they earned. */
  failCount: integer('fail_count').notNull().default(0),
  lockedUntil: text('locked_until'),
  createdAt: text('created_at').notNull(),
});

export const groups = sqliteTable('groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  colour: text('colour').notNull().default('#4dabff'),
  sort: integer('sort').notNull().default(0),
  active: integer('active').notNull().default(1),
  createdAt: text('created_at').notNull(),
});

export const kids = sqliteTable('kids', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  /** Lower-cased, so search uses an index rather than scanning. */
  searchName: text('search_name').notNull(),
  groupId: integer('group_id').references(() => groups.id, { onDelete: 'set null' }),
  active: integer('active').notNull().default(1),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  searchIdx: index('kids_search_idx').on(t.searchName),
  groupIdx: index('kids_group_idx').on(t.groupId, t.active),
}));

export const ledger = sqliteTable('ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kidId: integer('kid_id').notNull().references(() => kids.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  reason: text('reason', { enum: REASONS }).notNull(),
  note: text('note'),
  /** Who did it. Survives the leader being removed. */
  leaderId: integer('leader_id').references(() => leaders.id, { onDelete: 'set null' }),
  /** Ties one bulk award together so it can be undone as a unit. */
  batch: text('batch'),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  kidIdx: index('ledger_kid_idx').on(t.kidId, t.id),
  batchIdx: index('ledger_batch_idx').on(t.batch),
  whenIdx: index('ledger_when_idx').on(t.createdAt),
}));

export const cards = sqliteTable('cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kidId: integer('kid_id').notNull().references(() => kids.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  label: text('label'),
  createdAt: text('created_at').notNull(),
  revokedAt: text('revoked_at'),
  lastUsedAt: text('last_used_at'),
}, (t) => ({
  codeIdx: uniqueIndex('cards_code').on(t.code),
  kidIdx: index('cards_kid_idx').on(t.kidId),
}));

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type Leader = typeof leaders.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Kid = typeof kids.$inferSelect;
export type LedgerRow = typeof ledger.$inferSelect;
export type Card = typeof cards.$inferSelect;
