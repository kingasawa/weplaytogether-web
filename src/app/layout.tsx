import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
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
      className={beVietnamPro.variable}
    >
      <body>{children}</body>
    </html>
  );
}
