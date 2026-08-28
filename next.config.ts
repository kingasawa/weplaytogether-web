import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // App chạy trên Cloudflare Workers (OpenNext) và KHÔNG có binding IMAGES, nên /_next/image
    // không resize được: nó trả nguyên file gốc, mỗi ảnh là một lần Worker chạy + đệm cả file
    // trong RAM, không có Cache-Control. Đó là nguyên nhân lỗi 1102 (vượt tài nguyên isolate).
    // Tắt tối ưu ảnh -> ảnh đi thẳng qua Cloudflare static assets: có CDN cache, Worker không đụng tới.
    // Bù lại, ảnh nguồn phải sẵn sàng để dùng: xem scripts/optimize-images.mjs.
    unoptimized: true,
    // Cho phép next/image tải avatar người chơi từ Google Cloud Storage.
    // Giới hạn đúng folder avatar/ để không mở toàn bộ host.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/weplaytogether-uploads/avatar/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh4.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh5.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh6.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
