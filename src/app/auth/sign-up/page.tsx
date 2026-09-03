import type { Metadata } from "next";
import { vi } from "@/i18n/dictionaries";
import { normalizeAuthNextPath } from "@/lib/auth-redirect";
import AuthScreen from "../auth-screen";

type SignUpPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export const metadata: Metadata = {
  title: `${vi["auth.modeTitle.signUp"]} | WePlayTogether`,
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { next } = await searchParams;

  return <AuthScreen mode="sign-up" nextPath={normalizeAuthNextPath(next)} />;
}
