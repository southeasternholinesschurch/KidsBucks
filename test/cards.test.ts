/**
 * Card codes.
 *
 * A code is the only thing standing in front of a child's page, so the two
 * properties worth proving are that it is unguessable and that a child reading
 * one off a printed card by hand still gets in.
 *
 *   npm test
 */
import { newCardCode, normaliseCode, isCardCode, formatCode, codesMatch } from '../src/lib/cards.ts';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.error(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

/* ---- what a generated code looks like ---- */
const code = newCardCode();
eq('a code is twelve characters', code.length, 12);
eq('a generated code passes its own check', isCardCode(code), true);
eq('a generated code needs no normalising', normaliseCode(code), code);

// The alphabet leaves out the characters a child gets wrong copying a code off
// a card: I, L, O and U are never emitted.
(() => {
  const many = Array.from({ length: 400 }, () => newCardCode()).join('');
  eq('no I, L, O or U is ever generated', /[ILOU]/.test(many), false);
  eq('everything generated is in the alphabet', /^[0-9A-HJKMNP-TV-Z]+$/.test(many), true);
})();

/* ---- IT HAS TO BE UNGUESSABLE ----
 * Not a statistical test, but it does catch the mistake that matters: a
 * generator that is constant, or seeded the same way every call, or quietly
 * returning the same value because the CSPRNG was stubbed.
 */
(() => {
  const codes = new Set(Array.from({ length: 2000 }, () => newCardCode()));
  eq('two thousand codes are two thousand different codes', codes.size, 2000);
  // Every position must vary; a bug that froze one character would halve the
  // space without changing the length.
  const varies = Array.from({ length: 12 }, (_, i) =>
    new Set([...codes].map((c) => c[i])).size);
  eq('every position varies', varies.every((n) => n > 8), true);
})();

/* ---- typing one in off a card ---- */
eq('lower case is fine', normaliseCode('4rtx9k2mbp70'), '4RTX9K2MBP70');
eq('the printed dashes are optional', normaliseCode('4RTX-9K2M-BP70'), '4RTX9K2MBP70');
eq('spaces are fine', normaliseCode(' 4RTX 9K2M BP70 '), '4RTX9K2MBP70');
// O and I are never generated, so somebody typing them meant 0 and 1.
eq('a typed O means zero', normaliseCode('O123456789AB'), '0123456789AB');
eq('a typed I means one', normaliseCode('I123456789AB'), '1123456789AB');
eq('a typed L means one', normaliseCode('L123456789AB'), '1123456789AB');
eq('empty normalises to empty', normaliseCode(''), '');
eq('null normalises to empty', normaliseCode(null), '');

/* ---- what is refused before the database is touched ---- */
eq('too short is refused', isCardCode('4RTX9K2M'), false);
eq('too long is refused', isCardCode('4RTX9K2MBP70X'), false);
eq('empty is refused', isCardCode(''), false);
eq('null is refused', isCardCode(null), false);
eq('a url path is refused', isCardCode('../../settings'), false);
// Normalising happens first, so a correctly-shaped code with dashes is valid.
eq('a dashed code is accepted', isCardCode('4RTX-9K2M-BP70'), true);

/* ---- printing ---- */
eq('grouped in fours', formatCode('4RTX9K2MBP70'), '4RTX-9K2M-BP70');
eq('formatting is idempotent', formatCode(formatCode('4RTX9K2MBP70')), '4RTX-9K2M-BP70');

/* ---- comparing ---- */
eq('a code matches itself', codesMatch(code, code), true);
eq('a different code does not', codesMatch('4RTX9K2MBP70', '4RTX9K2MBP71'), false);
eq('a shorter code does not', codesMatch('4RTX9K2MBP70', '4RTX'), false);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
if (fail) process.exit(1);
