/**
 * Each child's colour, made readable.
 *
 * The four seeded hues are the children's own and are not ours to change — a
 * child gets attached to theirs. But measured against white, every one of them
 * fails: Kate 3.75:1, Cole 4.22, Cliff 3.44, Kennedy 2.14, where 4.5 is the
 * floor for body text. Cole's blue fails against dark ink too, so there is no
 * single ink colour that works for all four.
 *
 * So the HUE and SATURATION are kept exactly as seeded — Kate stays pink,
 * Kennedy stays amber — and only LIGHTNESS is nudged, by the smallest step
 * that clears the floor, against whichever ink is already closer. Kennedy's
 * amber keeps dark ink at 8.5:1; Cole's blue deepens a little and takes white.
 *
 * Pure and importing nothing, so the floor is a test rather than a promise.
 */

/** WCAG AA for large text is 3:1, but these numbers are read across a kitchen
 *  by a child who is still sounding words out. Hold body-text contrast. */
export const MIN_CONTRAST = 4.5;

/** The dark ink, matching --ink in the stylesheet. */
export const INK_DARK = '#16141f';
export const INK_LIGHT = '#ffffff';

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };

/** A #rgb or #rrggbb somebody typed into a colour input, or null. */
export function parseHex(hex: string | null | undefined): Rgb | null {
  const s = String(hex ?? '').trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const toHex = ({ r, g, b }: Rgb): string =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** WCAG relative luminance. */
export function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0))
          : max === G ? (B - R) / d + 2
          : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
      hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/**
 * A readable surface in this child's colour, and the ink to write on it.
 *
 * Picks whichever ink is already closer, then walks lightness towards it in
 * 1% steps until the ratio clears the floor. Hue and saturation are never
 * touched, so the result is still recognisably their colour.
 *
 * Falls back to the accent orange for anything unparseable, rather than
 * throwing on a hand-edited database row.
 */
export function readable(hex: string | null | undefined): { surface: string; ink: string } {
  const rgb = parseHex(hex) ?? parseHex('#fa6601')!;
  const dark = parseHex(INK_DARK)!, light = parseHex(INK_LIGHT)!;

  const useDark = contrast(rgb, dark) >= contrast(rgb, light);
  const ink = useDark ? dark : light;
  // Towards dark ink means a LIGHTER surface, and vice versa.
  const step = useDark ? 0.01 : -0.01;

  const hsl = rgbToHsl(rgb);
  let best = rgb;
  // 100 steps is the whole lightness range; it always terminates, and at the
  // extremes white-on-black or black-on-white wins long before that.
  for (let i = 0; i <= 100 && contrast(best, ink) < MIN_CONTRAST; i++) {
    best = hslToRgb({ ...hsl, l: Math.min(1, Math.max(0, hsl.l + step * i)) });
  }
  return { surface: toHex(best), ink: toHex(ink) };
}

/**
 * The near-black ground for a child's own page, tinted with their hue.
 *
 * Still the single darkest value, used for the browser's own theme colour (the
 * chrome around the page, which cannot take a gradient) and as the floor the
 * gradient sits on.
 */
export function ground(hex: string | null | undefined): string {
  const rgb = parseHex(hex) ?? parseHex('#fa6601')!;
  const { h, s } = rgbToHsl(rgb);
  return toHex(hslToRgb({ h, s: Math.min(s, 0.45), l: 0.055 }));
}

/** The same colour, moved up or down in lightness. Hue and saturation stay. */
export function shift(hex: string | null | undefined, delta: number): string {
  const rgb = parseHex(hex) ?? parseHex('#fa6601')!;
  const { h, s, l } = rgbToHsl(rgb);
  return toHex(hslToRgb({ h, s, l: Math.min(1, Math.max(0, l + delta)) }));
}

export type Tint = { hi: string; lo: string; ink: string; glow: string };

/**
 * A child's card, as a small gradient rather than a flat fill.
 *
 * The readable surface from readable() becomes the DARK end, and the light end
 * is moved further AWAY from the ink. That ordering is the point: every colour
 * between the two ends is then at least as readable as the end that was
 * actually measured, so the whole gradient clears the floor rather than only
 * its midpoint. For a card taking dark ink the gradient lightens; for one
 * taking white ink it deepens.
 */
export function tint(hex: string | null | undefined): Tint {
  const { surface, ink } = readable(hex);
  const away = ink === INK_DARK ? 0.10 : -0.10;
  return {
    lo: surface,
    hi: shift(surface, away),
    ink,
    // The colour it throws onto the background behind it. Half-transparent,
    // so it reads as light rather than as a second card.
    glow: surface + '80',
  };
}

/** The same, ready to drop into a style attribute. */
export const tintStyle = (hex: string | null | undefined): string => {
  const t = tint(hex);
  return `--hi:${t.hi};--lo:${t.lo};--glow:${t.glow};--on-tint:${t.ink};`;
};

export type Gradient = { a: string; b: string; c: string; base: string };

/**
 * Three soft lights and the dark they sit on.
 *
 * The background is not a flat colour but three big overlapping radial washes
 * — the cheapest way to get something that looks lit rather than painted, and
 * it costs no images and no extra requests.
 *
 * EVERY STOP IS DARK ENOUGH FOR WHITE TEXT ON ITS OWN. The washes overlap and
 * pile up, so the only way to guarantee the text stays readable wherever they
 * happen to land is for each one to clear the floor by itself. test/colour.test.ts
 * checks all four, for the house gradient and for every child.
 */
export function gradient(hex: string | null | undefined): Gradient {
  const rgb = parseHex(hex) ?? parseHex('#fa6601')!;
  const { h, s } = rgbToHsl(rgb);
  // Held in a band: too grey and the tint is invisible, too saturated and the
  // washes read as three separate colours rather than one lit room.
  const sat = Math.min(Math.max(s, 0.5), 0.8);
  return {
    a: toHex(hslToRgb({ h, s: sat, l: 0.23 })),
    b: toHex(hslToRgb({ h: (h + 42) % 360, s: sat, l: 0.17 })),
    c: toHex(hslToRgb({ h: (h + 318) % 360, s: sat, l: 0.20 })),
    base: ground(hex),
  };
}

/**
 * The gradient everywhere that is not one child's page — the board, the PIN
 * pad, the parent screens. Violet into blue into magenta: nobody's colour in
 * particular, so no child's page feels like the default one.
 */
export const HOUSE: Gradient = {
  a: '#3a1a6b', b: '#10355e', c: '#6b1a4f', base: '#0c0a18',
};
