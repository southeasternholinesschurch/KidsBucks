/**
 * PINs, and the cookie that remembers one was entered.
 *
 * Two levels: FAMILY lets you look, PARENT lets you change. They are separate
 * secrets so a child who watches a parent unlock the buttons has learnt the
 * looking PIN, not the changing one.
 *
 * A four-digit PIN is guessable by brute force and no amount of hashing
 * changes that — the real protection here is that this is a pocket-money chart
 * on an unlisted address. Hashing is still worth twenty lines, because a
 * plaintext PIN in a database is a plaintext password somebody has reused
 * somewhere that matters.
 *
 * No node: imports and no database — crypto.subtle is global in both Workers
 * and node, so all of this is unit-testable.
 */



/**
 * PBKDF2 rounds.
 *
 * 100,000 IS A PLATFORM CEILING, NOT A PREFERENCE. Cloudflare Workers refuses
 * anything above it outright:
 *
 *   NotSupportedError: Pbkdf2 failed: iteration counts above 100000
 *   are not supported (requested 120000)
 *
 * This was set to 120,000 and threw on every successful /setup in production
 * — and only there, because the local dev runtime allows it. Astro turned the
 * thrown error into a redirect, so the form simply appeared to reload and the
 * database stayed empty. It is why the prototype this was built from had
 * "never been past /setup".
 *
 * test/pin.test.ts holds the ceiling, because nothing else will.
 */
export const ITERATIONS = 100_000;
const enc = new TextEncoder();

const toHex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (s: string) =>
  new Uint8Array((s.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));

/**
 * A PIN somebody typed. Digits only, 4 to 10.
 *
 * Longer is allowed on purpose: nothing here forces four, and a parent who
 * wants six should not be stopped by a form.
 */
export const isValidPin = (pin: string | null | undefined): boolean =>
  /^\d{4,10}$/.test(String(pin ?? '').trim());

/** Store as salt:hash. The salt is per-PIN, so the two PINs cannot be
 *  compared to each other by looking at the rows. */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `${toHex(salt.buffer)}:${toHex(bits)}`;
}

/** Constant-time, and false for anything malformed rather than throwing. */
export async function verifyPin(pin: string, stored: string | null | undefined): Promise<boolean> {
  if (!pin || !stored) return false;
  const [saltHex, wantHex] = String(stored).split(':');
  if (!saltHex || !wantHex) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  const got = toHex(bits);
  if (got.length !== wantHex.length) return false;
  // Compared byte by byte without short-circuiting, so how long the rejection
  // takes says nothing about how much of the hash was right.
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ wantHex.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------ the cookie -- */

/**
 * The access cookie is SIGNED rather than stored.
 *
 * A family of six needs no session table and no cleanup job — and rotating the
 * signing secret signs everybody out at once, which is the only revocation
 * this will ever need.
 *
 * Shape: level.expiresAt.signature
 */
export async function signAccess(secret: string, leaderId: number, expiresAt: number): Promise<string> {
  const body = `L${leaderId}.${expiresAt}`;
  return `${body}.${await sign(secret, body)}`;
}

/** The level this token grants, or null. Expiry is checked before the
 *  signature is trusted for anything. */
export async function readAccess(secret: string, token: string | null | undefined): Promise<number | null> {
  if (!secret || !token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [who, expiresRaw, sig] = parts as [string, string, string];
  // "L" then digits. A card token has four parts and starts "card", so the
  // two can never be read as each other even before the signature is checked.
  if (!/^L[1-9]\d*$/.test(who)) return null;
  const leaderId = Number(who.slice(1));
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  const want = await sign(secret, `${who}.${expiresRaw}`);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? leaderId : null;
}

/* ------------------------------------------------------- the card cookie -- */

/**
 * A card was scanned, and it was THIS CARD.
 *
 * Carries the card's id rather than the child's, and that is the whole point:
 * the caller looks the card up on every request and finds out whether it has
 * been revoked since. A token naming the child would be a standing pass that
 * outlived its own revocation, which would make the Revoke button a lie for
 * exactly the device it matters on — the one that already scanned the card
 * that went missing.
 *
 * Signed with the same secret as the access cookie, so "sign everybody out"
 * takes every card with it too.
 *
 * Shape: card.cardId.expiresAt.signature — FOUR parts, where an access token
 * has three. That is not decoration: it means neither token can be read as the
 * other even before the signature is checked, so a card can never be bent into
 * a level and a family token can never be bent into a card.
 */
export async function signCard(secret: string, cardId: number, expiresAt: number): Promise<string> {
  const body = `card.${cardId}.${expiresAt}`;
  return `${body}.${await sign(secret, body)}`;
}

/** The card this token names, or null. Whether that card is still LIVE is a
 *  separate question, answered against the database — see readCardKid. */
export async function readCard(secret: string, token: string | null | undefined): Promise<number | null> {
  if (!secret || !token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 4) return null;
  const [tag, idRaw, expiresRaw, sig] = parts as [string, string, string, string];
  if (tag !== 'card') return null;
  const cardId = Number(idRaw);
  if (!Number.isInteger(cardId) || cardId <= 0) return null;
  // Expiry is checked BEFORE the signature is trusted for anything.
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  const want = await sign(secret, `${tag}.${idRaw}.${expiresRaw}`);
  if (want.length !== sig.length) return null;
  // Byte by byte without short-circuiting, so how long the rejection takes
  // says nothing about how much of the signature was right.
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? cardId : null;
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
}
