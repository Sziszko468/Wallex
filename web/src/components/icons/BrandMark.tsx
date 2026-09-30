import { useId } from "react";

interface BrandMarkProps {
  size?: number;
  /** Adds an accessible name; decorative (hidden from screen readers) otherwise. */
  title?: string;
}

/**
 * The Spendly ring: three unequal arcs — sage for what you keep, teal for saving, sand for
 * what's set aside — with round ends and a slight tilt. The same shape as /favicon.svg,
 * but coloured with theme tokens so it stays harmonious in dark mode.
 */
export function BrandMark({ size = 28, title }: BrandMarkProps) {
  const titleId = useId();
  const common = { cx: 12, cy: 12, r: 8 } as const;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      strokeWidth={3.4}
      strokeLinecap="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      focusable="false"
    >
      {title && <title id={titleId}>{title}</title>}
      <g transform="rotate(-100 12 12)">
        <circle {...common} stroke="var(--color-primary)" strokeDasharray="15.08 35.18" />
        <circle {...common} stroke="var(--color-savings)" strokeDasharray="10.05 40.21" strokeDashoffset={-21.44} />
        <circle {...common} stroke="var(--color-sand)" strokeDasharray="6.03 44.23" strokeDashoffset={-37.85} />
      </g>
    </svg>
  );
}
