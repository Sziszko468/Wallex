import { useRef, type KeyboardEvent } from "react";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/iconPaths";
import styles from "./SegmentedControl.module.scss";

const ICON_SIZE = { sm: 15, md: 17 } as const;

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  /** Tints the selected segment — used by the income/expense switch. */
  tone?: "income" | "expense";
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the whole control. */
  label: string;
  /**
   * "radio": pick exactly one (theme, transaction type) — arrow keys move and select.
   * "pressed": independent toggle buttons that happen to look grouped (a period switch).
   */
  semantics?: "radio" | "pressed";
  size?: "sm" | "md";
  fullWidth?: boolean;
}

const ARROW_STEPS: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  semantics = "radio",
  size = "md",
  fullWidth = false,
}: SegmentedControlProps<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isRadio = semantics === "radio";

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = ARROW_STEPS[event.key];
    if (!isRadio || step === undefined) return;
    event.preventDefault();
    const current = options.findIndex((option) => option.value === value);
    const nextIndex = (current + step + options.length) % options.length;
    const next = options[nextIndex];
    if (!next) return;
    onChange(next.value);
    buttonRefs.current[nextIndex]?.focus();
  }

  const groupClasses = [styles.group, styles[size], fullWidth ? styles.fullWidth : ""].filter(Boolean).join(" ");

  return (
    // The arrow-key handling is the radio-group pattern; the buttons inside remain the focus targets.
    <div
      role={isRadio ? "radiogroup" : "group"}
      aria-label={label}
      className={groupClasses}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;
        const classes = [
          styles.segment,
          isSelected ? styles.selected : "",
          isSelected && option.tone ? styles[option.tone] : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role={isRadio ? "radio" : undefined}
            aria-checked={isRadio ? isSelected : undefined}
            aria-pressed={isRadio ? undefined : isSelected}
            // Radio groups have one tab stop (the selected option); arrows move within.
            tabIndex={isRadio && !isSelected ? -1 : undefined}
            className={classes}
            onClick={() => onChange(option.value)}
          >
            {option.icon && <Icon name={option.icon} size={ICON_SIZE[size]} />}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
