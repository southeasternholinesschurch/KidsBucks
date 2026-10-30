import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';

/**
 * Every read the app does, in one place, written so that no screen pulls the
 * whole ledger across the wire.
 *
 * The distinction that matters at two hundred children is between AGGREGATING
 * IN SQL and TRANSFERRING ROWS. Summing twenty thousand integers inside
 * SQLite is milliseconds; fetching twenty thousand rows into JavaScript to add
 * them up is the thing that makes an app feel broken. The family app this
 * grew out of did the latter on every child's page — it loaded a child's
 * entire history to show the last twenty rows — which was invisible at four
 * children and would not have been at two hundred.
 */

/** How many history rows a page shows before "older". */
export const PAGE = 25;

/**
 * The front page: every class and how many children are in it.
 *
 * NO TOTALS HERE, deliberately. A class total mostly measures how many
 * children are in the class and how long it has existed, not anything a
 * leader can act on — so it was a big number that invited a comparison it
 * could not support. Ranking classes is a thing you go to Standings to do.
 *
 * Dropping it also means this query never touches the ledger, which is why
 * the busiest screen in the app is the cheapest one.
 */
export async function groupsWithCounts(env: { DB: D1Database }) {
  const rows = await getDb(env).all<{ id: number; name: string; colour: string; kids: number }>(sql`
    select g.id, g.name, g.colour, count(k.id) as kids
      from groups g
      left join kids k on k.group_id = g.id and k.active = 1
     where g.active = 1
     group by g.id
     order by g.sort, g.name
  `);
  return rows.map((r) => ({ ...r, kids: Number(r.kids) }));
}

/**
 * Classes WITH their totals, for the standings — where ranking them is the
 * point and the extra work is worth it.
 *
 * COUNT(DISTINCT k.id) rather than COUNT(k.id), because joining the ledger
 * multiplies each child by their number of entries — without DISTINCT a busy
 * class of twenty reads as a class of six hundred.
 */
export async function groupsWithTotals(env: { DB: D1Database }) {
  const rows = await getDb(env).all<{
    id: number; name: string; colour: string; kids: number; total: number;
  }>(sql`
    select g.id, g.name, g.colour,
           count(distinct k.id) as kids,
           coalesce(sum(l.delta), 0) as total
      from groups g
      left join kids   k on k.group_id = g.id and k.active = 1
      left join ledger l on l.kid_id = k.id
     where g.active = 1
     group by g.id
     order by g.sort, g.name
  `);
  return rows.map((r) => ({ ...r, kids: Number(r.kids), total: Number(r.total) }));
}

/** Children with no group yet — they still earn, so they must be reachable. */
export async function ungroupedCount(env: { DB: D1Database }): Promise<number> {
  const [row] = await getDb(env).all<{ n: number }>(sql`
    select count(*) as n from kids where active = 1 and group_id is null
  `);
  return Number(row?.n ?? 0);
}

/**
 * The children in one group, with balances.
 *
 * Bounded by design: a class is twenty-odd children, so this is the screen a
 * leader actually works from and it stays small however big the ministry gets.
 */
export async function kidsInGroup(env: { DB: D1Database }, groupId: number | null) {
  const rows = await getDb(env).all<{ id: number; name: string; balance: number }>(sql`
    select k.id, k.name, coalesce(sum(l.delta), 0) as balance
      from kids k
      left join ledger l on l.kid_id = k.id
     where k.active = 1
       and ${groupId === null ? sql`k.group_id is null` : sql`k.group_id = ${groupId}`}
     group by k.id
     order by k.name collate nocase
  `);
  return rows.map((r) => ({ ...r, balance: Number(r.balance) }));
}

/** One child's balance. A single indexed aggregate, not a download. */
export async function balanceOfKid(env: { DB: D1Database }, kidId: number): Promise<number> {
  const [row] = await getDb(env).all<{ balance: number }>(sql`
    select coalesce(sum(delta), 0) as balance from ledger where kid_id = ${kidId}
  `);
  return Number(row?.balance ?? 0);
}

/**
 * A page of history, newest first.
 *
 * Keyset pagination on the id rather than OFFSET: offset makes the database
 * count past everything it skips, so page twenty of a long history costs
 * twenty times page one. `before` is the id of the last row already shown.
 */
export async function historyPage(
  env: { DB: D1Database }, kidId: number, before?: number | null, limit = PAGE,
) {
  const db = getDb(env);
  const where = before
    ? and(eq(schema.ledger.kidId, kidId), lt(schema.ledger.id, before))
    : eq(schema.ledger.kidId, kidId);

  const rows = await db.select({
    id: schema.ledger.id,
    delta: schema.ledger.delta,
    reason: schema.ledger.reason,
    note: schema.ledger.note,
    batch: schema.ledger.batch,
    createdAt: schema.ledger.createdAt,
    leaderName: schema.leaders.name,
  }).from(schema.ledger)
    .leftJoin(schema.leaders, eq(schema.ledger.leaderId, schema.leaders.id))
    .where(where)
    .orderBy(desc(schema.ledger.id))
    .limit(limit + 1);           // one extra, purely to know if there is more

  const more = rows.length > limit;
  return { rows: rows.slice(0, limit), more };
}

/**
 * Search by name.
 *
 * Against the lower-cased search_name column so SQLite uses the index rather
 * than lower()-ing every row on each keystroke. A leading wildcard cannot use
 * an index at all, so this matches from the start of the name or the start of
 * any word in it — which is how people search for a child anyway.
 */
export async function searchKids(env: { DB: D1Database }, q: string, limit = 40) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const rows = await getDb(env).all<{
    id: number; name: string; groupName: string | null; balance: number;
  }>(sql`
    select k.id, k.name, g.name as groupName, coalesce(sum(l.delta), 0) as balance
      from kids k
      left join groups g on g.id = k.group_id
      left join ledger l on l.kid_id = k.id
     where k.active = 1
       and (k.search_name like ${needle + '%'} or k.search_name like ${'% ' + needle + '%'})
     group by k.id
     order by k.name collate nocase
     limit ${limit}
  `);
  return rows.map((r) => ({ ...r, balance: Number(r.balance) }));
}

/** The top children overall. Viewed occasionally, so it may cost more. */
export async function leaderboard(env: { DB: D1Database }, limit = 25) {
  const rows = await getDb(env).all<{
    id: number; name: string; groupName: string | null; balance: number;
  }>(sql`
    select k.id, k.name, g.name as groupName, coalesce(sum(l.delta), 0) as balance
      from kids k
      left join groups g on g.id = k.group_id
      left join ledger l on l.kid_id = k.id
     where k.active = 1
     group by k.id
     having balance > 0
     order by balance desc, k.name collate nocase
     limit ${limit}
  `);
  return rows.map((r) => ({ ...r, balance: Number(r.balance) }));
}

/** One child, with the group they are in. */
export async function getKid(env: { DB: D1Database }, id: number) {
  const [row] = await getDb(env).select({
    id: schema.kids.id,
    name: schema.kids.name,
    active: schema.kids.active,
    groupId: schema.kids.groupId,
    groupName: schema.groups.name,
    groupColour: schema.groups.colour,
  }).from(schema.kids)
    .leftJoin(schema.groups, eq(schema.kids.groupId, schema.groups.id))
    .where(eq(schema.kids.id, id)).limit(1);
  return row ?? null;
}

export async function allGroups(env: { DB: D1Database }, includeInactive = false) {
  const db = getDb(env);
  const q = db.select().from(schema.groups).$dynamic();
  return (includeInactive ? q : q.where(eq(schema.groups.active, 1)))
    .orderBy(asc(schema.groups.sort), asc(schema.groups.name));
}

export async function allLeaders(env: { DB: D1Database }, includeInactive = false) {
  const db = getDb(env);
  const q = db.select().from(schema.leaders).$dynamic();
  return (includeInactive ? q : q.where(eq(schema.leaders.active, 1)))
    .orderBy(asc(schema.leaders.name));
}

/** What a bulk award did, for showing it back and for undoing it. */
export async function batchSummary(env: { DB: D1Database }, batch: string) {
  const [row] = await getDb(env).all<{ n: number; delta: number; at: string }>(sql`
    select count(*) as n, coalesce(sum(delta), 0) as delta, min(created_at) as at
      from ledger where batch = ${batch}
  `);
  return row ? { count: Number(row.n), total: Number(row.delta), at: row.at } : null;
}
