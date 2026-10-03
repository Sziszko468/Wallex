/** WCAG relative luminance of a "#rrggbb" colour. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two "#rrggbb" colours (1–21). */
export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** "rgba(59, 130, 246, 0.16)" laid over a "#rrggbb" background, as the "#rrggbb" the eye sees. */
export function composite(rgba: string, background: string): string {
  const match = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(rgba);
  if (!match) throw new Error(`Not an rgba colour: ${rgba}`);
  const [, r, g, b, alpha] = match;
  const front = [Number(r), Number(g), Number(b)];
  const back = [1, 3, 5].map((offset) => parseInt(background.slice(offset, offset + 2), 16));
  const mixed = front.map((channel, index) => Math.round(channel * Number(alpha) + (back[index] as number) * (1 - Number(alpha))));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
