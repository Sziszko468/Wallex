import type { SVGProps } from "react";
import { ICON_PATHS, type IconName } from "./iconPaths";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name" | "children"> {
  name: IconName;
  /** Pixels (a number) or any CSS length. */
  size?: number | string;
  /** Gives the icon an accessible name. Without it the icon is decorative and hidden from screen readers. */
  title?: string;
}

/** One line-icon from the Spendly set (see iconPaths.tsx). Takes its colour from `currentColor`. */
export function Icon({ name, size = 20, title, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      {...rest}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
