import styles from "./PagePlaceholder.module.scss";

interface PagePlaceholderProps {
  title: string;
  description: string;
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <section className={styles.placeholder}>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}
