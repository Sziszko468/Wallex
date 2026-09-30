import { Icon } from "../icons/Icon";
import styles from "./SuggestedQuestions.module.scss";

interface SuggestedQuestionsProps {
  questions: string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}

export function SuggestedQuestions({ questions, onPick, disabled = false }: SuggestedQuestionsProps) {
  if (questions.length === 0) return null;
  return (
    <section className={styles.suggestions} aria-label="Suggested questions">
      <h2 className={styles.heading}>Try asking</h2>
      <ul className={styles.list}>
        {questions.map((question) => (
          <li key={question}>
            <button type="button" className={styles.chip} onClick={() => onPick(question)} disabled={disabled}>
              <Icon name="assistant" size={18} />
              <span>{question}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
