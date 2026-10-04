import { useTranslation } from "react-i18next";
import styles from "./FollowUpQuestions.module.scss";

interface FollowUpQuestionsProps {
  questions: string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}

/** What to ask next, under the latest answer: one tap sends the question. */
export function FollowUpQuestions({ questions, onPick, disabled = false }: FollowUpQuestionsProps) {
  const { t } = useTranslation();
  if (questions.length === 0) return null;
  return (
    <ul className={styles.chips} aria-label={t("assistant.messages.followUps")}>
      {questions.map((question) => (
        <li key={question}>
          <button type="button" className={styles.chip} onClick={() => onPick(question)} disabled={disabled}>
            {question}
          </button>
        </li>
      ))}
    </ul>
  );
}
