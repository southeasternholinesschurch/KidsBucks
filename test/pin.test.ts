/**
 * PINs and the access cookie.
 *
 * The two properties worth proving: a wrong PIN never verifies, and a cookie
 * cannot be edited to promote a child from looking to changing.
 *
 *   npm test
 */
import { isValidPin, hashPin, verifyPin, signAccess, readAccess, signCard, readCard, ITERATIONS } from '../src/lib/pin.ts';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.error(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

// ---- the platform ceiling ---------------------------------------------------
//
// Cloudflare Workers refuses PBKDF2 above 100,000 rounds outright. At 120,000
// this threw on every successful /setup in production and nowhere else — the
// local runtime allows it — and Astro turned the throw into a redirect, so the
// form just seemed to reload while the database stayed empty. A deploy is the
// wrong place to find this out, so it is asserted here.
const eqLte = (label: string, got: number, limit: number) => {
  if (got > limit) { fail++; console.error(`FAIL ${label}\n  got  ${got}\n  want <= ${limit}`); }
  else console.log(`ok   ${label} (${got})`);
};
eqLte('PBKDF2 rounds stay within what Workers allows', ITERATIONS, 100_000);

// ---- what counts as a PIN ---------------------------------------------------
eq('four digits', isValidPin('1234'), true);
eq('ten digits', isValidPin('1234567890'), true);
eq('three is too few', isValidPin('123'), false);
eq('eleven is too many', isValidPin('12345678901'), false);
eq('letters are not a PIN', isValidPin('12a4'), false);
eq('empty', isValidPin(''), false);
eq('null', isValidPin(null), false);
eq('spaces inside', isValidPin('12 34'), false);

// ---- hashing ----------------------------------------------------------------
const stored = await hashPin('4821');
eq('the right PIN verifies', await verifyPin('4821', stored), true);
eq('a wrong PIN does not', await verifyPin('4822', stored), false);
eq('a shorter PIN does not', await verifyPin('482', stored), false);
eq('an empty PIN does not', await verifyPin('', stored), false);
// The PIN itself must not be recoverable by looking at the row.
eq('the PIN is not in what is stored', stored.includes('4821'), false);
// Two hashes of the SAME pin differ, because the salt differs — so the two
// PINs cannot be compared to each other just by looking at the rows.
const again = await hashPin('4821');
eq('salted: same PIN hashes differently', stored === again, false);
eq('but both still verify', await verifyPin('4821', again), true);
eq('a malformed row does not verify', await verifyPin('4821', 'nonsense'), false);
eq('a missing row does not verify', await verifyPin('4821', null), false);

// ---- the leader session cookie ----------------------------------------------
//
// The token names WHICH LEADER, not what they are allowed to do. Role and
// active status are read from the row on every request, so this cookie cannot
// carry a promotion — which is why there is no "edited to say admin" attack
// to defend against here, only an "edited to name somebody else" one.
const SECRET = 'a-signing-secret-for-the-test';
const hour = Date.now() + 3600_000;

const kim = await signAccess(SECRET, 7, hour);
eq('a leader token reads back its leader', await readAccess(SECRET, kim), 7);

// THE ONE THAT MATTERS. Editing the id is the obvious attack on this cookie.
const asSomeoneElse = kim.replace('L7.', 'L8.');
eq('a token edited to name another leader is refused', await readAccess(SECRET, asSomeoneElse), null);

eq('a token signed with another secret is refused',
   await readAccess(SECRET, await signAccess('some-other-secret', 7, hour)), null);
// Rotating the secret is the only revocation this needs, so it has to work.
eq('rotating the secret signs everybody out', await readAccess('rotated', kim), null);

// ---- expiry -----------------------------------------------------------------
eq('an expired token is refused',
   await readAccess(SECRET, await signAccess(SECRET, 7, Date.now() - 1000)), null);
// Pushing the expiry out by hand breaks the signature, so it cannot be extended.
const extended = kim.replace(String(hour), String(Date.now() + 99_000_000));
eq('an extended expiry is refused', await readAccess(SECRET, extended), null);

eq('leader zero is refused', await readAccess(SECRET, await signAccess(SECRET, 0, hour)), null);
eq('a negative leader is refused', await readAccess(SECRET, await signAccess(SECRET, -1, hour)), null);
eq('a non-numeric leader is refused', await readAccess(SECRET, `Lx.${hour}.deadbeef`), null);
eq('junk is refused', await readAccess(SECRET, 'nonsense'), null);
eq('empty is refused', await readAccess(SECRET, ''), null);
eq('no secret means no access', await readAccess('', kim), null);

// ---- the card cookie --------------------------------------------------------
//
// A card grants read access to ONE child. The properties that matter are that
// it cannot be edited to name a different child, and that the two kinds of
// token cannot be read as each other — a card must never become a level, and a
// family token must never become a child.
const card = await signCard(SECRET, 3, hour);
eq('a card token reads back its card', await readCard(SECRET, card), 3);

// THE ONE THAT MATTERS. Editing the id is the obvious attack on this cookie,
// and the id names a CARD, which is looked up and can be revoked — see
// readCardKid. A token naming the child would outlive its own revocation.
const otherCard = card.replace('card.3.', 'card.4.');
eq('a card edited to name another card is refused', await readCard(SECRET, otherCard), null);

// The two token shapes must not be interchangeable.
eq('a leader token is not a card', await readCard(SECRET, kim), null);
eq('a card is not an access token', await readAccess(SECRET, card), null);
eq('a card cannot be bent into a leader',
   await readAccess(SECRET, card.replace('card.3', 'L3')), null);

eq('a card signed with another secret is refused', await readCard('other-secret', card), null);
eq('rotating the secret invalidates every card', await readCard('rotated', card), null);
eq('an expired card is refused',
   await readCard(SECRET, await signCard(SECRET, 3, Date.now() - 1000)), null);
eq('a card with its expiry pushed out is refused',
   await readCard(SECRET, card.replace(String(hour), String(Date.now() + 99_000_000))), null);
eq('a card naming card zero is refused', await readCard(SECRET, await signCard(SECRET, 0, hour)), null);
eq('junk is not a card', await readCard(SECRET, 'card.1.2'), null);
eq('empty is not a card', await readCard(SECRET, ''), null);
eq('no secret means no card', await readCard('', card), null);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
if (fail) process.exit(1);
