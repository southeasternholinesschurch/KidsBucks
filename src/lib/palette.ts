/**
 * Group colours.
 *
 * Eight of them, cycled. The family app this grew out of gave every CHILD a
 * colour, which works beautifully at four and is impossible at two hundred —
 * so here the colour belongs to the class, which is the thing a leader is
 * actually looking for on a board.
 *
 * Every one is measured against the dark ink printed on it at better than
 * 6.5:1; the lowest is the violet. test/colour.test.ts holds that floor.
 */
export const GROUP_PALETTE = [
  '#ff6fb5', // pink
  '#4dabff', // blue
  '#2fe0a6', // mint
  '#b57bff', // violet
  '#ffb020', // amber
  '#ff8a65', // coral
  '#7dd3fc', // sky
  '#a3e635', // lime
] as const;

/** The colour a newly created group gets, so a ministry that adds classes
 *  one at a time still ends up with a spread rather than eight pinks. */
export const colourForIndex = (i: number): string =>
  GROUP_PALETTE[((i % GROUP_PALETTE.length) + GROUP_PALETTE.length) % GROUP_PALETTE.length];

/** Children with no class yet. Deliberately grey: it is a state to clear, not
 *  a group to belong to. */
export const UNGROUPED_COLOUR = '#94a3b8';
