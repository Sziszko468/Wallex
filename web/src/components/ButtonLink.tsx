import { Link, type LinkProps } from "react-router-dom";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/iconPaths";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./buttonStyles";

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
}

/** A router link that looks like a <Button> — for navigation that happens to be a call to action. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {leadingIcon && <Icon name={leadingIcon} size={18} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} size={18} />}
    </Link>
  );
}
