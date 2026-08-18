import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WePlayTogether",
    short_name: "WePlayTogether",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050912",
    theme_color: "#050912",
    icons: [
      { src: "/images/icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/images/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/images/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
