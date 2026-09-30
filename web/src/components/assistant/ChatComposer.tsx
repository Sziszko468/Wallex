import { useId, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "../Button";
import styles from "./ChatComposer.module.scss";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (question: string) => void;
  maxLength: number;
  /** Waiting for an answer, or the assistant can't be used. */
  disabled: boolean;
}

export function ChatComposer({ value, onChange, onSubmit, maxLength, disabled }: ChatComposerProps) {
  const inputId = useId();
  const counterId = useId();
  const canSend = !disabled && value.trim().length > 0;
  const nearLimit = value.length > maxLength * 0.8;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (canSend) onSubmit(value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter adds a line (and Enter while an IME is composing text does neither).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      <label htmlFor={inputId} className={styles.label}>
        Ask about your finances
      </label>
      <textarea
        id={inputId}
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={maxLength}
        rows={2}
        placeholder="e.g. Where did I spend more than last month?"
        disabled={disabled}
        aria-describedby={nearLimit ? counterId : undefined}
      />
      <div className={styles.footer}>
        <span id={counterId} className={styles.counter} aria-live="polite">
          {nearLimit ? `${value.length} / ${maxLength}` : ""}
        </span>
        <Button type="submit" size="sm" leadingIcon="arrow-up" disabled={!canSend}>
          Send
        </Button>
      </div>
    </form>
  );
}
