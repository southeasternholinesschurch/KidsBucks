/**
 * Importing a roster.
 *
 * This is the first thing a new ministry does and the first thing that can go
 * wrong, so the edge cases are tests rather than discoveries on the day: a
 * name with a comma in it, a spreadsheet pasted with tabs, a header row, a
 * trailing blank line, the same child twice.
 *
 *   npm test
 */
import {
  splitCsvLine, looksLikeHeader, parseRoster, groupsIn, MAX_NAME, MAX_ROWS,
} from '../src/lib/roster.ts';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.error(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

/* ---- splitting a line ---- */
eq('plain fields', splitCsvLine('Jacob,K-2nd'), ['Jacob', 'K-2nd']);
eq('spaces are trimmed', splitCsvLine('  Jacob ,  K-2nd  '), ['Jacob', 'K-2nd']);
// A spreadsheet pasted straight in arrives tab-separated, not comma.
eq('tabs work like commas', splitCsvLine('Jacob\tK-2nd'), ['Jacob', 'K-2nd']);
eq('one field is fine', splitCsvLine('Jacob'), ['Jacob']);
// The reason this is hand-rolled at all.
eq('a quoted comma stays in the name', splitCsvLine('"Smith, John",K-2nd'), ['Smith, John', 'K-2nd']);
eq('a doubled quote is a literal quote', splitCsvLine('"Jo ""Jojo"" Smith"'), ['Jo "Jojo" Smith']);
eq('an empty second field', splitCsvLine('Jacob,'), ['Jacob', '']);

/* ---- headers ---- */
eq('Name is a header', looksLikeHeader(['Name', 'Group']), true);
eq('child is a header', looksLikeHeader(['Child']), true);
eq('case does not matter', looksLikeHeader(['NAME']), true);
eq('an actual child is not a header', looksLikeHeader(['Jacob']), false);

/* ---- whole pastes ---- */
(() => {
  const r = parseRoster(`Name,Group
Jacob,K-2nd
Ava,K-2nd
Noah,3rd-5th`);
  eq('the header row is dropped', r.rows.length, 3);
  eq('names and groups', r.rows, [
    { name: 'Jacob', group: 'K-2nd' },
    { name: 'Ava', group: 'K-2nd' },
    { name: 'Noah', group: '3rd-5th' },
  ]);
  eq('nothing skipped', r.skipped, []);
  eq('groups in first-seen order', groupsIn(r.rows), ['K-2nd', '3rd-5th']);
})();

(() => {
  // No header, no groups — the simplest thing somebody might paste.
  const r = parseRoster('Jacob\nAva\nNoah');
  eq('a bare list works', r.rows, [
    { name: 'Jacob', group: null }, { name: 'Ava', group: null }, { name: 'Noah', group: null },
  ]);
  eq('no groups mentioned', groupsIn(r.rows), []);
})();

(() => {
  // Blank lines are what you get from a copy-paste, not an error.
  const r = parseRoster('\n\nJacob\n\n\nAva\n\n');
  eq('blank lines are ignored silently', r.rows.length, 2);
  eq('and are not reported as skipped', r.skipped, []);
})();

(() => {
  const r = parseRoster('Jacob\n,K-2nd\nAva');
  eq('a line with no name is skipped', r.rows.length, 2);
  eq('with its line number', r.skipped, [{ line: 2, text: ',K-2nd', reason: 'no name on this line' }]);
})();

(() => {
  const long = 'x'.repeat(MAX_NAME + 1);
  const r = parseRoster(`Jacob\n${long}`);
  eq('an absurd name is skipped', r.rows.length, 1);
  eq('and says why', r.skipped[0].reason, 'name is too long');
})();

(() => {
  // At 200 children a repeat is usually a double-paste, but sometimes there
  // really are two children with the same name — so keep both and warn.
  const r = parseRoster('Jacob,K-2nd\nAva,K-2nd\njacob,3rd-5th');
  eq('duplicates are kept', r.rows.length, 3);
  eq('and flagged, case-insensitively', r.duplicates, ['jacob']);
})();

(() => {
  const r = parseRoster('Jacob,  K-2nd  \nAva,k-2nd');
  eq('group whitespace is trimmed', r.rows[0].group, 'K-2nd');
  /*
   * "K-2nd" and "k-2nd" in the same paste are one class typed twice, not two
   * classes. Creating both would split a group in half on day one, so they
   * collapse to the FIRST spelling seen — the row keeps what was typed, and
   * the group that gets created is the one that appeared first.
   */
  eq('casing variants are one group', groupsIn(r.rows), ['K-2nd']);
  eq('but each row keeps what was typed', r.rows[1].group, 'k-2nd');
})();

(() => {
  const many = Array.from({ length: MAX_ROWS + 5 }, (_, i) => `Child ${i}`).join('\n');
  const r = parseRoster(many);
  eq('the row cap holds', r.rows.length, MAX_ROWS);
  eq('and the overflow is reported', r.skipped.length, 5);
  eq('with a reason', r.skipped[0].reason, `over the ${MAX_ROWS}-row limit`);
})();

eq('empty input', parseRoster(''), { rows: [], skipped: [], duplicates: [] });
eq('whitespace only', parseRoster('   \n  \n'), { rows: [], skipped: [], duplicates: [] });

// A real 200-child paste should come through whole.
(() => {
  const lines = Array.from({ length: 200 }, (_, i) =>
    `Child ${i},${['Preschool', 'K-2nd', '3rd-5th'][i % 3]}`).join('\n');
  const r = parseRoster(lines);
  eq('two hundred children import cleanly', r.rows.length, 200);
  eq('and resolve to three groups', groupsIn(r.rows).length, 3);
  eq('with nothing skipped', r.skipped.length, 0);
})();

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
if (fail) process.exit(1);
