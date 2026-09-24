import { Redirect } from "expo-router";
import { useAuth } from "../hooks/useAuth";

export default function Index() {
  const { status } = useAuth();
  if (status === "signedIn") return <Redirect href="/dashboard" />;
  if (status === "locked") return <Redirect href="/unlock" />;
  return <Redirect href="/login" />;
}
