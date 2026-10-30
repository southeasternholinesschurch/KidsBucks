import { and, eq, isNull } from 'drizzle-orm';
import type { AstroCookies } from 'astro';
import { getDb, schema, nowIso } from '../db';
import { signAccess, readAccess, signCard, readCard } from './pin';
export { isValidLeaderPin, lockMinutes, isLocked, lockRemaining } from './lockout';

/**
 * Who is asking, and what they may do.
 *
 * Two quite different things sign in here:
 *
 *   A LEADER, with their own name and PIN, so every entry in the ledger can
 *   say who made it. With a dozen volunteers and two hundred children, "who
 *   gave Jayden fifty bucks" has to have an answer.
 *
 *   A CHILD'S CARD, which grants read access to that one child's page and
 *   nothing else. No buttons, no other children, no admin.
 *
 * Neither is trusted from the cookie alone. The cookie says WHICH leader or
 * WHICH card, and the row is re-read on every request — so a volunteer who
 * stops helping is locked out the moment they are deactivated rather than
 * whenever their cookie happens to expire, and a lost card stops working the
 * moment it is revoked.
 */

const SESSION = 'kb_session';
const CARD = 'kb_card';
/** A Sunday-to-Sunday app: a leader should not be typing a PIN mid-service
 *  because a week went by, but a phone left somewhere should not stay open
 *  for a year either. */
const SESSION_DAYS = 30;
const CARD_DAYS = 180;

export const KEY_SECRET = 'cookie_secret';

export async function getSetting(env: { DB: D1Database }, key: string): Promise<string | null> {
  const rows = await getDb(env).select().from(schema.settings)
    .where(eq(schema.settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function putSetting(env: { DB: D1Database }, key: string, value: string): Promise<void> {
  await getDb(env).insert(schema.settings)
    .values({ key, value, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: nowIso() } });
}

export const newSecret = (): string =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

/** Has anybody set this up yet? Everything redirects to /setup until then. */
export async function isSetUp(env: { DB: D1Database }): Promise<boolean> {
  const [row] = await getDb(env).select({ id: schema.leaders.id })
    .from(schema.leaders).limit(1);
  return Boolean(row);
}

/* --------------------------------------------------------------- leaders -- */

export async function grantLeader(
  env: { DB: D1Database }, cookies: AstroCookies, leaderId: number, secure: boolean,
): Promise<void> {
  const secret = await getSetting(env, KEY_SECRET);
  if (!secret) return;
  const expiresAt = Date.now() + SESSION_DAYS * 86400_000;
  cookies.set(SESSION, await signAccess(secret, leaderId, expiresAt), {
    httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_DAYS * 86400,
  });
}

/**
 * The leader this request carries, re-read from the database.
 *
 * The cookie is only ever an id. Role and active status come from the row, so
 * promoting somebody, demoting them or removing them takes effect on their
 * next request rather than whenever they next sign in.
 */
export async function readLeader(
  env: { DB: D1Database }, cookies: AstroCookies,
): Promise<{ id: number; name: string; role: 'admin' | 'leader' } | null> {
  const secret = await getSetting(env, KEY_SECRET);
  if (!secret) return null;
  const id = await readAccess(secret, cookies.get(SESSION)?.value);
  if (!id) return null;
  const [row] = await getDb(env).select({
    id: schema.leaders.id, name: schema.leaders.name, role: schema.leaders.role,
  }).from(schema.leaders)
    .where(and(eq(schema.leaders.id, id), eq(schema.leaders.active, 1))).limit(1);
  return row ?? null;
}

export function forgetLeader(cookies: AstroCookies): void {
  cookies.delete(SESSION, { path: '/' });
}

/* ------------------------------------------------------------------ card -- */

export async function grantCard(
  env: { DB: D1Database }, cookies: AstroCookies, cardId: number, secure: boolean,
): Promise<void> {
  const secret = await getSetting(env, KEY_SECRET);
  if (!secret) return;
  const expiresAt = Date.now() + CARD_DAYS * 86400_000;
  cookies.set(CARD, await signCard(secret, cardId, expiresAt), {
    httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: CARD_DAYS * 86400,
  });
}

/**
 * The child whose card this request carries.
 *
 * The card is looked up EVERY request, not just when it was scanned: a signed
 * cookie cannot know it has been revoked, and trusting it would leave the
 * browser that already scanned a lost card working perfectly afterwards —
 * which is the one case revoking exists for.
 */
export async function readCardKid(
  env: { DB: D1Database }, cookies: AstroCookies,
): Promise<number | null> {
  const secret = await getSetting(env, KEY_SECRET);
  if (!secret) return null;
  const cardId = await readCard(secret, cookies.get(CARD)?.value);
  if (!cardId) return null;
  const [row] = await getDb(env).select({ kidId: schema.cards.kidId })
    .from(schema.cards)
    .where(and(eq(schema.cards.id, cardId), isNull(schema.cards.revokedAt)))
    .limit(1);
  return row?.kidId ?? null;
}

export function forgetCard(cookies: AstroCookies): void {
  cookies.delete(CARD, { path: '/' });
}
