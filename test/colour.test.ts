/**
 * The palette, measured rather than eyeballed.
 *
 * The brief's rule is a 4.5:1 floor, and the reason it is a rule is that the
 * church app shipped brand pastels at 1.7:1 and nobody noticed until a screen
 * was held up in daylight. Measured against white, all four of the children's
 * seeded colours fail — so the floor has to be a test, checked on every run,
 * not a thing somebody remembers to look at before a deploy.
 *
 *   npm test
 */
import {
  parseHex, toHex, contrast, readable, ground, gradient, tint, shift,
  rgbToHsl, hslToRgb, HOUSE, MIN_CONTRAST, INK_DARK,
} from '../src/lib/colour.ts';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.error(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};
const atLeast = (label: string, got: number, want: number) => {
  const ok = got >= want;
  if (!ok) { fail++; console.error(`FAIL ${label}\n  got  ${got}\n  want at least ${want}`); }
  else console.log(`ok   ${label} (${got.toFixed(2)})`);
};

/* ---- parsing ---- */
eq('six digits', parseHex('#1f9e5a'), { r: 31, g: 158, b: 90 });
eq('three digits expand', parseHex('#f0a'), { r: 255, g: 0, b: 170 });
eq('case does not matter', parseHex('#F0A'), parseHex('#f0a'));
eq('no hash is refused', parseHex('1f9e5a'), null);
eq('a colour name is refused', parseHex('red'), null);
eq('empty is refused', parseHex(''), null);
eq('null is refused', parseHex(null), null);
eq('four digits are refused', parseHex('#1f9e'), null);

/* ---- the ratio itself, against values with known answers ---- */
eq('black on white is 21', Math.round(contrast(parseHex('#000')!, parseHex('#fff')!)), 21);
eq('a colour against itself is 1', contrast(parseHex('#2d7dd2')!, parseHex('#2d7dd2')!), 1);

/* ---- hsl round trip, since the fix works in that space ---- */
(() => {
  for (const hex of ['#ff6fb5', '#4dabff', '#2fe0a6', '#b57bff', '#ffffff', '#000000', '#808080']) {
    eq(`${hex} survives a round trip`, toHex(hslToRgb(rgbToHsl(parseHex(hex)!))), hex);
  }
})();

/* ---- THE RULE. Every child's colour is readable. ---- */
const CHILDREN: [string, string][] = [
  ['pink', '#ff6fb5'], ['blue', '#4dabff'], ['mint', '#2fe0a6'], ['violet', '#b57bff'],
  ['amber', '#ffb020'], ['coral', '#ff8a65'], ['sky', '#7dd3fc'], ['lime', '#a3e635'],
];
for (const [name, hex] of CHILDREN) {
  const { surface, ink } = readable(hex);
  atLeast(`${name}'s card is readable`, contrast(parseHex(surface)!, parseHex(ink)!), MIN_CONTRAST);
  atLeast(`${name}'s page ground is readable`,
          contrast(parseHex(ground(hex))!, parseHex('#ffffff')!), MIN_CONTRAST);
  // Their colour is still THEIR colour: same hue, only lightness moved.
  eq(`${name} keeps their hue`,
     Math.round(rgbToHsl(parseHex(surface)!).h), Math.round(rgbToHsl(parseHex(hex)!).h));
}

// The whole reason the palette went dark: these colours are bright, so they
// take DARK ink, and on a dark background that is exactly what makes them pop.
for (const [name, hex] of CHILDREN) {
  eq(`${name} takes dark ink`, readable(hex).ink, INK_DARK);
}

/* ---- THE CARD IS A GRADIENT, so BOTH ends have to clear the floor ----
 * Measuring only the colour that was seeded would pass a card whose darker
 * end is unreadable. tint() puts the measured surface at the dark end and
 * moves the other end AWAY from the ink for exactly this reason.
 */
for (const [name, hex] of CHILDREN) {
  const t = tint(hex);
  atLeast(`${name}'s card is readable at its dark end`,
          contrast(parseHex(t.lo)!, parseHex(t.ink)!), MIN_CONTRAST);
  atLeast(`${name}'s card is readable at its light end`,
          contrast(parseHex(t.hi)!, parseHex(t.ink)!), MIN_CONTRAST);
}

/* ---- THE BACKGROUND WASHES, each on its own ----
 * The three lights overlap and pile up, so the only way to know white text is
 * readable wherever they land is for every one of them to clear the floor by
 * itself.
 */
const white = parseHex('#ffffff')!;
for (const [key, value] of Object.entries(HOUSE)) {
  atLeast(`the house gradient's ${key} takes white text`,
          contrast(parseHex(value)!, white), MIN_CONTRAST);
}
for (const [name, hex] of CHILDREN) {
  for (const [key, value] of Object.entries(gradient(hex))) {
    atLeast(`${name}'s ${key} wash takes white text`,
            contrast(parseHex(value)!, white), MIN_CONTRAST);
  }
}

/* ---- shift moves lightness and nothing else ---- */
eq('shift keeps the hue', Math.round(rgbToHsl(parseHex(shift('#4dabff', 0.1))!).h),
   Math.round(rgbToHsl(parseHex('#4dabff')!).h));
eq('shift clamps at white rather than wrapping', shift('#ffffff', 0.5), '#ffffff');
eq('shift clamps at black rather than wrapping', shift('#000000', -0.5), '#000000');

/* ---- a hand-edited row must not take a page down ---- */
(() => {
  for (const junk of ['', 'blue', null, undefined, '#zzz']) {
    const { surface, ink } = readable(junk as string);
    atLeast(`junk (${JSON.stringify(junk)}) still returns something readable`,
            contrast(parseHex(surface)!, parseHex(ink)!), MIN_CONTRAST);
  }
})();

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
if (fail) process.exit(1);
