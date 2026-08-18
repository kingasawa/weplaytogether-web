import type { Metadata, Viewport } from "next";
import { Anton, Sora, Inter } from "next/font/google";
import "./globals.css";

const defaultSiteUrl = "https://weplaytogether.online";

function getMetadataBase() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? defaultSiteUrl;
  const siteUrlWithProtocol = /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;

  return new URL(siteUrlWithProtocol);
}

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "Board Game",
  description: "Board game platform",
  applicationName: "WePlayTogether",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${anton.variable} ${sora.variable} ${inter.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
