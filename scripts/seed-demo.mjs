#!/usr/bin/env node
/**
 * A demo ministry, so you can see what 200 children looks like before you
 * type a real roster in.
 *
 *   node scripts/seed-demo.mjs > demo.sql
 *   npx wrangler d1 execute kidsbucks --local --file=demo.sql
 *
 * Writes SQL rather than talking to the database itself, so the same file
 * works against a local database or a remote one, and so you can read it
 * before you run it.
 *
 * It DELETES everything first. Never point this at a database with real
 * children in it.
 */
const GROUPS = ['Nursery', 'Preschool', 'Kindergarten', '1st-2nd', '3rd-4th', '5th-6th', 'Jr High', 'Sr High'];
const COLOURS = ['#ff6fb5', '#4dabff', '#2fe0a6', '#b57bff', '#ffb020', '#ff8a65', '#7dd3fc', '#a3e635'];
const FIRST = ['Jacob','Ava','Noah','Mia','Liam','Emma','Ethan','Olivia','Mason','Sophia','Caleb','Lily',
               'Owen','Grace','Levi','Chloe','Eli','Zoe','Micah','Hannah','Silas','Nora','Asher','Ruby'];
const LAST  = ['Smith','Johnson','Brown','Davis','Miller','Wilson','Moore','Taylor','Clark','Hall',
               'Lewis','Walker','Young','King','Wright','Hill','Green','Adams','Baker','Nelson'];

/** Deterministic, so two runs produce the same demo and a screenshot keeps
 *  matching what you see. */
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length)];

const CHILDREN = Number(process.env.CHILDREN ?? 200);
const WEEKS = Number(process.env.WEEKS ?? 104);
const now = new Date().toISOString();
const out = ['DELETE FROM ledger; DELETE FROM cards; DELETE FROM kids; DELETE FROM groups;'];

GROUPS.forEach((g, i) => out.push(
  `INSERT INTO groups (id,name,colour,sort,active,created_at) VALUES (${i + 1},'${g}','${COLOURS[i]}',${(i + 1) * 10},1,'${now}');`));

const names = new Set();
for (let k = 1; k <= CHILDREN; k++) {
  let name;
  // Keep demo names distinct: two identical names in one class is a real
  // situation, but it makes a demo look broken rather than realistic.
  do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (names.has(name));
  names.add(name);
  out.push(`INSERT INTO kids (id,name,search_name,group_id,active,created_at) ` +
           `VALUES (${k},'${name.replace(/'/g, "''")}','${name.toLowerCase().replace(/'/g, "''")}',` +
           `${1 + Math.floor(rnd() * GROUPS.length)},1,'${now}');`);
}

const start = new Date(Date.now() - WEEKS * 7 * 86400_000);
for (let w = 0; w < WEEKS; w++) {
  const d = new Date(start.getTime() + w * 7 * 86400_000).toISOString().slice(0, 10);
  for (let k = 1; k <= CHILDREN; k++) {
    if (rnd() < 0.72) out.push(`INSERT INTO ledger (kid_id,delta,reason,created_at) ` +
      `VALUES (${k},${pick([1, 1, 2, 5, 5, 10])},'award','${d}T10:30:00.000Z');`);
    if (rnd() < 0.06) out.push(`INSERT INTO ledger (kid_id,delta,reason,note,created_at) ` +
      `VALUES (${k},-${pick([5, 10, 20])},'spend','prize table','${d}T11:15:00.000Z');`);
  }
}
process.stdout.write(out.join('\n') + '\n');
console.error(`demo: ${CHILDREN} children, ${GROUPS.length} classes, ~${out.length - 1 - GROUPS.length - CHILDREN} ledger rows`);
