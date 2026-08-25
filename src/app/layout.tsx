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

// Mã xác minh quyền sở hữu tên miền do Google Search Console cấp.
// Cách lấy: Search Console -> thêm property "https://weplaytogether.online" -> chọn cách
// xác minh "HTML tag" -> copy phần content="..." (chỉ chuỗi, không kèm thẻ) dán vào đây.
// Phải dùng đúng tài khoản Google đang sở hữu dự án OAuth thì Google mới công nhận.
const GOOGLE_SITE_VERIFICATION = "";

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  // Tên phải khớp chính xác tên app trên màn hình đồng ý OAuth của Google.
  title: "WePlayTogether",
  description:
    "WePlayTogether là nền tảng chơi board game suy luận online cho nhóm bạn: Ma Sói Một Đêm, " +
    "Ma Sói Nhiều Đêm, Avalon và Ai Là Gián Điệp. Tạo phòng, chia mã phòng và chơi ngay trên " +
    "điện thoại, không cần bộ bài giấy hay quản trò.",
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
