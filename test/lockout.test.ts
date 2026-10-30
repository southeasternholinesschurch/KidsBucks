/**
 * The rules around signing in.
 *
 * Imported from lib/lockout.ts rather than lib/auth.ts: auth.ts touches the
 * database, and plain node cannot import that. Keeping the policy separate is
 * what makes it testable at all.
 *
 * A six-digit PIN on an address anybody can reach is only as good as what
 * happens when somebody starts guessing, so the lockout is a test rather than
 * a hope.
 *
 *   npm test
 */
import { isValidLeaderPin, lockMinutes, isLocked, lockRemaining } from '../src/lib/lockout.ts';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.error(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

/* ---- what counts as a leader PIN ----
 * Six minimum, where the family app allowed four: this one is reachable from
 * anywhere and known to a dozen volunteers.
 */
eq('six digits', isValidLeaderPin('482100'), true);
eq('twelve digits', isValidLeaderPin('482100482100'), true);
eq('five is too few', isValidLeaderPin('48210'), false);
eq('four is too few', isValidLeaderPin('4821'), false);
eq('thirteen is too many', isValidLeaderPin('4821004821001'), false);
eq('letters are not a PIN', isValidLeaderPin('48a100'), false);
eq('spaces inside are not', isValidLeaderPin('482 100'), false);
eq('empty', isValidLeaderPin(''), false);
eq('null', isValidLeaderPin(null), false);

/* ---- the lockout ----
 * Nothing for the first few: a volunteer mistyping in a noisy room is normal,
 * and locking them out of their own class is worse than the risk.
 */
eq('a first slip costs nothing', lockMinutes(1), 0);
eq('nor a fourth', lockMinutes(4), 0);
eq('the fifth starts it', lockMinutes(5), 5);
eq('it climbs', lockMinutes(8), 15);
eq('and keeps climbing', lockMinutes(10), 60);
eq('and holds there', lockMinutes(50), 60);

/* ---- reading a lockout ---- */
(() => {
  const now = new Date('2026-10-29T12:00:00.000Z');
  eq('no lockout recorded', isLocked(null, now), false);
  eq('a lockout in the past has expired', isLocked('2026-10-29T11:59:00.000Z', now), false);
  eq('a lockout in the future holds', isLocked('2026-10-29T12:05:00.000Z', now), true);
  eq('junk is not a lockout', isLocked('whenever', now), false);

  eq('no minutes left when not locked', lockRemaining(null, now), 0);
  eq('minutes left, rounded up', lockRemaining('2026-10-29T12:04:30.000Z', now), 5);
  // Never says "0 minutes left" while still locked — that reads as a bug.
  eq('always at least one minute', lockRemaining('2026-10-29T12:00:01.000Z', now), 1);
})();

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
if (fail) process.exit(1);
