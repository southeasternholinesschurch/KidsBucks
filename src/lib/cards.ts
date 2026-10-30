/**
 * Card codes — a printed card a child can scan or type to reach their page.
 *
 * The code is a RANDOM TOKEN, not a secret anybody chose, and that is why it
 * is handled differently from a PIN. A PIN is hashed because a person picks it
 * and reuses it somewhere that matters; a card code is generated here, used
 * nowhere else, revocable in one tap, and has to be readable back out of the
 * database so a lost card can be reprinted rather than reissued.
 *
 * What it grants is deliberately small: read access to ONE child's page. Not
 * the board, not a sibling, not settings, and never the buttons — changing a
 * balance needs the parent PIN whoever is holding a card. A card that goes
 * through the wash therefore exposes one child's pocket money.
 *
 * Pure, and importing nothing, so it can be unit-tested in plain node.
 */

/**
 * Crockford's base32: no I, L, O or U.
 *
 * I and O are the two characters a child will get wrong copying a code off a
 * card by hand, and U is dropped so the generator cannot spell anything a
 * parent has to explain. `normalise` below maps the lookalikes back.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 12 characters of 32 is just under 60 bits. The code is the only thing
 *  standing in front of the page, so it has to be unguessable rather than
 *  merely unlikely. */
const LENGTH = 12;

/**
 * A new code, from the platform's CSPRNG.
 *
 * Math.random() is not acceptable here: it is seeded predictably enough that
 * one known code could narrow down the others, and this is the sort of place
 * that gets written once and never looked at again.
 *
 * The modulo is not biased: 32 divides 256 exactly.
 */
export function newCardCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * A code as somebody typed it, in the form it is stored.
 *
 * Case is ignored, dashes and spaces are dropped so the grouping printed on
 * the card can be typed or not, and the three lookalikes are folded: someone
 * reading O and I off a card means 0 and 1, because the generator never emits
 * O or I at all.
 */
export function normaliseCode(raw: string | null | undefined): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** Is this the shape of a code at all? Checked before touching the database,
 *  so junk in a URL is a cheap redirect rather than a query. */
export function isCardCode(raw: string | null | undefined): boolean {
  const s = normaliseCode(raw);
  return s.length === LENGTH && [...s].every((c) => ALPHABET.includes(c));
}

/** Grouped for printing and reading aloud: 4RTX-9K2M-BP70. */
export const formatCode = (code: string): string =>
  (normaliseCode(code).match(/.{1,4}/g) ?? []).join('-');

/**
 * Constant-time comparison.
 *
 * The lookup is by indexed column so this is belt and braces, but a code is a
 * bearer token and comparing bearer tokens with === is the habit that costs
 * somebody something one day.
 */
export function codesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
