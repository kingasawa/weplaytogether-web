import type { Metadata } from "next";
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
  title: "Đang đăng nhập | Boardverse",
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
