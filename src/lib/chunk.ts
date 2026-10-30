/**
 * Splitting a bulk insert so D1 will accept it.
 *
 * D1 allows at most 100 BOUND PARAMETERS per statement — not 100 rows. A
 * multi-row insert binds one parameter per column per row, so the real limit
 * is 100 divided by the width of the table, and it is easy to be well under
 * "a hundred rows" and still over the line.
 *
 * This was found by awarding a class of 24: twenty-four rows of seven columns
 * is 168 parameters, and D1 answered "too many SQL variables". A class is
 * exactly the size that trips it, which is to say the commonest operation in
 * the app would have failed on the first Sunday.
 */

/** D1's ceiling. Held a little under it, so adding a column later does not
 *  quietly put every bulk insert back over the edge. */
export const MAX_BOUND = 90;

/** How many rows of `columns` columns may go in one statement. */
export const rowsPerStatement = (columns: number): number =>
  Math.max(1, Math.floor(MAX_BOUND / Math.max(1, columns)));

/** The same list, cut into pieces that will bind. */
export function chunkRows<T extends object>(rows: T[], columns?: number): T[][] {
  if (rows.length === 0) return [];
  const width = columns ?? Math.max(1, Object.keys(rows[0]).length);
  const size = rowsPerStatement(width);
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
