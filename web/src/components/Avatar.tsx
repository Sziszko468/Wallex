import styles from "./Avatar.module.scss";

interface AvatarProps {
  /** The person's name or e-mail; their initial is shown. */
  name: string;
  size?: "sm" | "md" | "lg";
}

/** Up to two initials from a name, or the first letter of an e-mail address. */
function initialsOf(name: string): string {
  const words = name.split("@")[0]?.split(/[\s._-]+/).filter(Boolean) ?? [];
  const letters = words.slice(0, 2).map((word) => word.charAt(0));
  return (letters.join("") || "?").toUpperCase();
}

export function Avatar({ name, size = "md" }: AvatarProps) {
  return (
    <span className={`${styles.avatar} ${styles[size]}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
