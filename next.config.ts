import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Cho phép next/image tải avatar người chơi từ Cloudflare R2 custom domain.
    // Giới hạn đúng folder avatar/ để không mở toàn bộ host.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uploads.weplaytogether.online",
        pathname: "/avatar/**",
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
