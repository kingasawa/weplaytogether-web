import type { Metadata } from "next";
import { normalizeAuthNextPath } from "@/lib/auth-redirect";
import AuthScreen from "../auth-screen";

type SignInPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export const metadata: Metadata = {
  title: "Đăng nhập | Boardverse",
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { next } = await searchParams;

  return <AuthScreen mode="sign-in" nextPath={normalizeAuthNextPath(next)} />;
}
