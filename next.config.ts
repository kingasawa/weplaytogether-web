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
    ],
  },
};

export default nextConfig;
