import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { cookies } from "next/headers";
import { vi } from "@/i18n/dictionaries";
import { LanguageProvider } from "@/i18n/language-provider";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/i18n/locales";
import "./globals.css";

const defaultSiteUrl = "https://weplaytogether.online";

function getMetadataBase() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? defaultSiteUrl;
  const siteUrlWithProtocol = /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;

  return new URL(siteUrlWithProtocol);
}

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const GOOGLE_SITE_VERIFICATION = "";

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "WePlayTogether",
  description: vi["app.meta.description"],
  applicationName: "WePlayTogether",
  ...(GOOGLE_SITE_VERIFICATION ? { verification: { google: GOOGLE_SITE_VERIFICATION } } : {}),
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "WePlayTogether",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/images/icon.png",
    shortcut: "/images/icon.png",
    apple: "/images/icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#050912",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialLocale = normalizeLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value);

  return (
    <html
      lang={initialLocale}
      className={beVietnamPro.variable}
    >
      <body>
        <LanguageProvider initialLocale={initialLocale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
