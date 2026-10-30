/**
 * Sign-in policy: what counts as a PIN, and what a wrong guess costs.
 *
 * Kept apart from auth.ts, which touches the database, so this stays
 * unit-testable in plain node — the same discipline the rest of the project
 * follows for its arithmetic.
 */

/**
 * A leader's PIN. SIX digits minimum, where the family app this grew out of
 * allowed four.
 *
 * This address is reachable from anywhere and the PIN is known to a dozen
 * volunteers, so it is worth more than ten thousand guesses — and the lockout
 * below assumes a space big enough that locking out deters rather than merely
 * annoys.
 */
export const isValidLeaderPin = (pin: string | null | undefined): boolean =>
  /^\d{6,12}$/.test(String(pin ?? '').trim());

/**
 * How long a wrong guess costs, in minutes.
 *
 * Nothing for the first few, because a volunteer mistyping their PIN in a
 * noisy room is normal and locking them out of their own class is worse than
 * the risk. Then it climbs fast enough that guessing six digits stops being
 * worth anybody's afternoon.
 */
export function lockMinutes(failCount: number): number {
  if (failCount < 5) return 0;
  if (failCount < 8) return 5;
  if (failCount < 10) return 15;
  return 60;
}

export const isLocked = (lockedUntil: string | null | undefined, now: Date = new Date()): boolean =>
  Boolean(lockedUntil) && Date.parse(String(lockedUntil)) > now.getTime();

/** Minutes left on a lockout, rounded up, for telling somebody why. Never
 *  returns 0 while still locked — "0 minutes left" reads as a bug. */
export function lockRemaining(lockedUntil: string | null | undefined, now: Date = new Date()): number {
  if (!isLocked(lockedUntil, now)) return 0;
  return Math.max(1, Math.ceil((Date.parse(String(lockedUntil)) - now.getTime()) / 60_000));
}
