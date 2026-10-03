import { Notice } from "./ui/Notice";

interface ErrorBannerProps {
  message: string | null;
}

/** An error message above a form or list; nothing at all when there is none. */
export function ErrorBanner({ message }: ErrorBannerProps) {
  return <Notice message={message} tone="danger" />;
}
