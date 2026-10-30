/**
 * Bulk inserts, and D1's parameter ceiling.
 *
 * D1 allows 100 BOUND PARAMETERS per statement, not 100 rows. Awarding a
 * class of 24 binds 24 x 7 = 168 and is refused — which is to say the
 * commonest thing in the app is exactly the size that trips it.
 *
 *   npm test
 */
import { rowsPerStatement, chunkRows, MAX_BOUND } from '../src/lib/chunk.ts';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.error(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};
const atMost = (label: string, got: number, limit: number) => {
  if (got > limit) { fail++; console.error(`FAIL ${label}\n  got  ${got}\n  want <= ${limit}`); }
  else console.log(`ok   ${label} (${got})`);
};

eq('a seven-column ledger row', rowsPerStatement(7), 12);
eq('a five-column kid row', rowsPerStatement(5), 18);
eq('a one-column table', rowsPerStatement(1), 90);
// Never zero: a table wider than the ceiling still has to insert one row at
// a time rather than none at all.
// A table wider than the ceiling still inserts, one row per statement — it
// cannot get under the limit, and refusing to insert at all would be worse.
eq('an absurdly wide table still inserts', rowsPerStatement(200), 1);
eq('zero columns does not divide by zero', rowsPerStatement(0), 90);

/* ---- THE RULE: no chunk may exceed the ceiling ----
 * With one exception that is arithmetic rather than a bug: a table WIDER than
 * the ceiling cannot fit under it even one row at a time. Nothing here is
 * remotely that wide — the widest is the ledger at seven — but the rule has
 * to be stated honestly rather than asserted falsely.
 */
for (const cols of [1, 3, 5, 7, 11, 23, 90, 120]) {
  for (const n of [0, 1, 12, 24, 25, 200, 1000]) {
    const rows = Array.from({ length: n }, (_, i) => ({ i }));
    const chunks = chunkRows(rows, cols);
    eq(`${n} rows x ${cols} cols: nothing is lost`,
       chunks.reduce((t, c) => t + c.length, 0), n);
    const worst = Math.max(0, ...chunks.map((c) => c.length * cols));
    atMost(`${n} rows x ${cols} cols: stays under D1's limit`, worst, Math.max(MAX_BOUND, cols));
  }
}

eq('an empty list makes no statements', chunkRows([]), []);
// The width is inferred from the first row when it is not given.
eq('width is inferred from the row', chunkRows([{ a: 1, b: 2, c: 3 }]).length, 1);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
if (fail) process.exit(1);
