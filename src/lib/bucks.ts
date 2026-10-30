/**
 * The arithmetic. Pure, and importing nothing, so it can be unit-tested in
 * plain node.
 */

/** The biggest single entry. Not a security boundary — the only people here
 *  are volunteers — but "50" with a stuck key is 500, and a cap turns a slip
 *  into a refusal instead of a total nobody can explain. */
export const MAX_AMOUNT = 1000;

/** One tap each; nobody types on a phone in a busy room. */
export const PRESETS = [1, 5, 10];

/**
 * A balance is a SUM, never a stored column.
 *
 * Two leaders awarding the same child at the same moment would lose one of
 * the writes to a mutable balance, and a child disputing their total could
 * not be answered.
 */
export const balanceOf = (entries: { delta: number }[]): number =>
  entries.reduce((n, e) => n + e.delta, 0);

/**
 * An amount somebody typed. Always POSITIVE — direction comes from which
 * button was pressed, never from a minus sign, or "-5" in the spend box is a
 * five-buck award and nobody notices for a month.
 */
export function parseAmount(raw: string | null | undefined): number | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= MAX_AMOUNT ? n : null;
}

export const REASON_LABEL: Record<string, string> = {
  award: 'Earned', spend: 'Spent', correction: 'Fixed',
};

/**
 * Ties one bulk award together.
 *
 * A class award writes one row per child — the ledger stays per-child, which
 * is the whole point of it — but they share a batch so the whole thing can be
 * undone as a unit when somebody picks the wrong class.
 */
export const newBatchId = (): string => `b_${crypto.randomUUID()}`;

/** Each entry with the balance as it stood AFTER it, oldest first. */
export function withRunningBalance<T extends { delta: number }>(
  oldestFirst: T[], startingFrom = 0,
): (T & { running: number })[] {
  let running = startingFrom;
  return oldestFirst.map((e) => ({ ...e, running: (running += e.delta) }));
}

/** What a child sees when they have nothing yet. */
export const encouragement = (balance: number): string =>
  balance === 0 ? 'Nothing yet — go and earn some!'
  : balance < 0 ? 'In the hole. Time to earn some back.'
  : '';

/** Lower-cased for the indexed search column. Not a slug: children are
 *  reached by id, so this only ever has to match what somebody types. */
export const searchKey = (name: string): string =>
  String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
