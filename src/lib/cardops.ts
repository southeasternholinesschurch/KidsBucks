import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, schema, nowIso } from '../db';
import { newCardCode } from './cards';

/**
 * Issuing, replacing and revoking a child's card.
 *
 * Shared, because this happens in two places — the moment a child is created,
 * and later on their own page when a card goes missing — and the two must not
 * drift. A card that behaves differently depending on which screen made it is
 * a support question nobody can answer.
 *
 * The link is the point. These are NFC tags: whoever sets one up copies the
 * URL and writes it to the tag, so every one of these returns something you
 * can paste.
 */

export async function activeCardsFor(env: { DB: D1Database }, kidId: number) {
  return getDb(env).select().from(schema.cards)
    .where(and(eq(schema.cards.kidId, kidId), isNull(schema.cards.revokedAt)))
    .orderBy(desc(schema.cards.id));
}

/** A new card, retrying the astronomically unlikely code collision rather
 *  than failing in front of somebody holding a blank tag. */
export async function issueCard(env: { DB: D1Database }, kidId: number, label?: string | null) {
  const db = getDb(env);
  for (let i = 0; i < 5; i++) {
    try {
      const [row] = await db.insert(schema.cards).values({
        kidId, code: newCardCode(), label: label ?? null, createdAt: nowIso(),
      }).returning();
      return row;
    } catch { /* taken; draw another */ }
  }
  return null;
}

/**
 * Replace a lost card.
 *
 * Revokes every active card for the child FIRST, then issues one. Revoking
 * matters more than issuing here: a lost tag that still works is the whole
 * problem, and because the session cookie names the card rather than the
 * child, revoking cuts off a phone that already scanned it too.
 */
export async function replaceCard(env: { DB: D1Database }, kidId: number, label?: string | null) {
  await revokeAllFor(env, kidId);
  return issueCard(env, kidId, label);
}

/**
 * Kill every card a child holds.
 *
 * NOT exposed as a button anywhere. Revoking on its own — stop this working,
 * give nothing back — is not a thing anybody wants: a lost card needs
 * replacing, and a child who has left needs archiving. This is what those two
 * are built from.
 */
export async function revokeAllFor(env: { DB: D1Database }, kidId: number) {
  await getDb(env).update(schema.cards).set({ revokedAt: nowIso() })
    .where(and(eq(schema.cards.kidId, kidId), isNull(schema.cards.revokedAt)));
}

/** One place that knows what a card's URL looks like. */
export const cardUrl = (origin: string, code: string): string => `${origin}/c/${code}`;

export type CardActionResult = { handled: boolean; kidId?: number; done?: string };

/**
 * The three card buttons, handled identically wherever the block appears.
 *
 * Returns `handled: false` for anything that is not a card action, so a page
 * can run this first and then get on with its own POSTs.
 */
export async function handleCardAction(
  env: { DB: D1Database }, form: FormData,
): Promise<CardActionResult> {
  const act = String(form.get('action') ?? '');
  if (!act.startsWith('card-')) return { handled: false };

  const kidId = Number(form.get('kidId') ?? 0);
  if (!Number.isInteger(kidId) || kidId <= 0) return { handled: false };

  if (act === 'card-new') {
    await issueCard(env, kidId);
    return { handled: true, kidId, done: 'card' };
  }
  if (act === 'card-replace') {
    await replaceCard(env, kidId);
    return { handled: true, kidId, done: 'replaced' };
  }
  return { handled: false };
}
