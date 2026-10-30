/**
 * The arithmetic, and the amounts people type.
 *
 *   npm test
 */
import {
  balanceOf, parseAmount, withRunningBalance, searchKey, newBatchId, MAX_AMOUNT,
} from '../src/lib/bucks.ts';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.error(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

eq('nothing earned is nothing', balanceOf([]), 0);
eq('earning', balanceOf([{ delta: 5 }, { delta: 10 }]), 15);
eq('and spending', balanceOf([{ delta: 10 }, { delta: -4 }]), 6);
eq('a correction can go below zero', balanceOf([{ delta: 5 }, { delta: -8 }]), -3);

// Direction comes from the BUTTON. Accepting "-5" in the spend box would award
// five instead of taking them, and nobody would notice for a month.
eq('a negative is refused', parseAmount('-5'), null);
eq('a plus sign is refused', parseAmount('+5'), null);
eq('zero is refused', parseAmount('0'), null);
eq('a decimal is refused', parseAmount('2.5'), null);
eq('words are refused', parseAmount('five'), null);
eq('empty is refused', parseAmount(''), null);
eq('null is refused', parseAmount(null), null);
eq('a plain number', parseAmount('7'), 7);
eq('spaces are trimmed', parseAmount('  12 '), 12);
eq('the cap is allowed', parseAmount(String(MAX_AMOUNT)), MAX_AMOUNT);
eq('above the cap is refused', parseAmount(String(MAX_AMOUNT + 1)), null);

/* ---- running balance, used by the full history ---- */
eq('nothing has no running total', withRunningBalance([]), []);
eq('it accumulates oldest first',
   withRunningBalance([{ delta: 5 }, { delta: 10 }, { delta: -4 }]).map((e) => e.running),
   [5, 15, 11]);
// Paginated history starts partway through, so it has to be able to begin
// from the balance before the page rather than from zero.
eq('it can start from a carried balance',
   withRunningBalance([{ delta: 3 }, { delta: -1 }], 20).map((e) => e.running), [23, 22]);
(() => {
  const entries = [{ delta: 3 }, { delta: -8 }, { delta: 20 }, { delta: -1 }];
  const run = withRunningBalance(entries);
  eq('the last running value is the balance', run[run.length - 1].running, balanceOf(entries));
})();

/* ---- the search key ---- */
eq('lower cased', searchKey('Jacob'), 'jacob');
eq('accents folded, so Zoe finds Zoë', searchKey('Zoë'), 'zoe');
eq('inner whitespace collapsed', searchKey('Mary   Ann'), 'mary ann');
eq('trimmed', searchKey('  Jacob  '), 'jacob');

/* ---- batch ids ---- */
(() => {
  const ids = new Set(Array.from({ length: 500 }, () => newBatchId()));
  eq('every batch id is unique', ids.size, 500);
  eq('and is namespaced', [...ids].every((b) => b.startsWith('b_')), true);
})();

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
if (fail) process.exit(1);
