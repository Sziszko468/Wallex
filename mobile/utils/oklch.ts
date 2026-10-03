// Colour mixing in OKLCH — what the web app gets from CSS `color-mix(in oklch, …)`. React Native has
// no CSS colour functions, so the same blend is done here, in pure code. Used to give every category
// one calm, consistent look from the single hex colour the API stores for it.

export interface Oklch {
  l: number; // lightness 0–1
  c: number; // chroma, roughly 0–0.4
  h: number; // hue in degrees
}

const FALLBACK_RGB: Rgb = [156, 163, 175];
type Rgb = [number, number, number];

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#3b82f6" or "#38f" → [59, 130, 246]. Anything else is a neutral grey rather than an error. */
export function hexToRgb(hex: string): Rgb {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match) return FALLBACK_RGB;
  const digits = match[1] as string;
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function byteToHex(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
}

/** "#3b82f6" at 16% → "rgba(59, 130, 246, 0.16)". */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const toLinear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (value: number): number => {
  const clamped = Math.min(1, Math.max(0, value));
  return 255 * (clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055);
};

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: lightness, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

/** The linear sRGB triple for a colour, possibly outside 0–1 (outside the screen's gamut). */
function oklchToLinear({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const lp = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mp = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sp = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp,
    -1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp,
    -0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp,
  ];
}

const inGamut = (rgb: Rgb): boolean => rgb.every((channel) => channel >= -0.0001 && channel <= 1.0001);
const GAMUT_STEPS = 18;

/** OKLCH → "#rrggbb". A colour the screen can't show keeps its lightness and hue and loses chroma. */
export function oklchToHex(color: Oklch): string {
  let linear = oklchToLinear(color);
  if (!inGamut(linear)) {
    let low = 0;
    let high = color.c;
    for (let step = 0; step < GAMUT_STEPS; step += 1) {
      const middle = (low + high) / 2;
      if (inGamut(oklchToLinear({ ...color, c: middle }))) low = middle;
      else high = middle;
    }
    linear = oklchToLinear({ ...color, c: low });
  }
  return rgbToHex(linear.map(fromLinear) as Rgb);
}

/**
 * `weightA` of colour A plus the rest of colour B, mixed in OKLCH like CSS color-mix: lightness and
 * chroma blend linearly, the hue takes the shorter way round the colour wheel.
 */
export function mixOklch(hexA: string, hexB: string, weightA: number): string {
  const a = hexToOklch(hexA);
  const b = hexToOklch(hexB);
  const weightB = 1 - weightA;
  const hueDelta = ((b.h - a.h + 540) % 360) - 180;
  return oklchToHex({
    l: a.l * weightA + b.l * weightB,
    c: a.c * weightA + b.c * weightB,
    h: (a.h + hueDelta * weightB + 360) % 360,
  });
}
