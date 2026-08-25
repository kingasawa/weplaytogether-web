import type { Metadata } from "next";
import { normalizeAuthNextPath } from "@/lib/auth-redirect";
import AuthScreen from "../auth-screen";

type SignUpPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export const metadata: Metadata = {
  title: "Đăng ký | WePlayTogether",
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { next } = await searchParams;

  return <AuthScreen mode="sign-up" nextPath={normalizeAuthNextPath(next)} />;
}
