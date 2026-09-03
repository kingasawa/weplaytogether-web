import type { Metadata } from "next";
import { vi } from "@/i18n/dictionaries";
import AuthCallbackScreen from "./auth-callback-screen";

type AuthCallbackPageProps = {
  searchParams: Promise<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
    next?: string | string[];
  }>;
};

export const metadata: Metadata = {
  title: `${vi["auth.callback.loading"]} | WePlayTogether`,
};

function getFirstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

export default async function AuthCallbackPage({ searchParams }: AuthCallbackPageProps) {
  const params = await searchParams;

  return (
    <AuthCallbackScreen
      code={getFirstParam(params.code)}
      error={getFirstParam(params.error)}
      errorDescription={getFirstParam(params.error_description)}
      nextPath={getFirstParam(params.next)}
    />
  );
}
