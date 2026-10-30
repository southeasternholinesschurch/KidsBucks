/**
 * Getting 200 children in, without typing 200 forms.
 *
 * A ministry starts with a list that already exists — a spreadsheet, a
 * check-in export, a sheet of paper somebody typed up. This parses that,
 * pasted straight into a box, and says exactly what it could not use rather
 * than silently importing 183 of 200.
 *
 * Pure, and importing nothing, so every edge case below is a test rather than
 * a discovery on the day.
 */

export const MAX_NAME = 120;
export const MAX_GROUP = 60;
/** One paste should not be able to insert unbounded work. */
export const MAX_ROWS = 1000;

export type RosterRow = { name: string; group: string | null };
export type RosterSkip = { line: number; text: string; reason: string };
export type RosterResult = {
  rows: RosterRow[];
  skipped: RosterSkip[];
  /** Names appearing more than once in the paste, kept but worth warning
   *  about: at this size duplicates are usually a double-paste, but they are
   *  sometimes genuinely two children with the same name. */
  duplicates: string[];
};

/**
 * One CSV line into fields.
 *
 * Hand-rolled rather than pulled from a dependency because the only thing
 * that matters here is quotes around a name with a comma in it — "Smith,
 * John" — and a doubled quote inside one.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }   // "" is a literal quote
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',' || ch === '\t') {             // tabs, for a spreadsheet paste
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const HEADER_WORDS = new Set(['name', 'child', 'student', 'kid', 'full name', 'first name']);

/** Is this first line a header rather than a child called "Name"? */
export const looksLikeHeader = (fields: string[]): boolean =>
  fields.length > 0 && HEADER_WORDS.has(fields[0].toLowerCase());

/**
 * A pasted roster.
 *
 * Accepts "Name" or "Name, Group" per line, with or without a header row, and
 * with commas or tabs between them. Anything it cannot use comes back in
 * `skipped` WITH ITS LINE NUMBER, so a 200-line paste that drops three names
 * can be fixed rather than wondered about.
 */
export function parseRoster(text: string): RosterResult {
  const rows: RosterRow[] = [];
  const skipped: RosterSkip[] = [];
  const seen = new Map<string, number>();

  const lines = String(text ?? '').split(/\r\n|\r|\n/);
  let started = false;

  for (const [i, raw] of lines.entries()) {
    const lineNo = i + 1;
    if (rows.length >= MAX_ROWS) {
      skipped.push({ line: lineNo, text: raw.slice(0, 60), reason: `over the ${MAX_ROWS}-row limit` });
      continue;
    }
    if (!raw.trim()) continue;                      // blank lines are not an error

    const fields = splitCsvLine(raw);
    if (!started && looksLikeHeader(fields)) { started = true; continue; }
    started = true;

    const name = fields[0]?.replace(/\s+/g, ' ').trim() ?? '';
    if (!name) {
      skipped.push({ line: lineNo, text: raw.slice(0, 60), reason: 'no name on this line' });
      continue;
    }
    if (name.length > MAX_NAME) {
      skipped.push({ line: lineNo, text: raw.slice(0, 60), reason: 'name is too long' });
      continue;
    }

    const group = (fields[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP) || null;
    rows.push({ name, group });

    const key = name.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  return { rows, skipped, duplicates };
}

/** The distinct groups a paste mentions, in the order they first appear. */
export function groupsIn(rows: RosterRow[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.group) continue;
    const key = r.group.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r.group);
  }
  return out;
}
