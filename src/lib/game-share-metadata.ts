import type { Metadata } from "next";

const SITE_NAME = "Boardverse";

type GameShareImage = {
  path: string;
  width: number;
  height: number;
  alt: string;
};

type GameShareMetadataInput = {
  title: string;
  description: string;
  path: string;
  image: GameShareImage;
};

export const WOLF_SHARE_IMAGE: GameShareImage = {
  path: "/images/boards/wolf.png",
  width: 290,
  height: 610,
  alt: "Ảnh bìa game Ma Sói Một Đêm",
};

export const CLASSIC_WOLF_SHARE_IMAGE: GameShareImage = {
  path: "/images/boards/wolf-classic.png",
  width: 811,
  height: 1940,
  alt: "Ảnh bìa game Ma Sói Nhiều Đêm",
};

export const AVALON_SHARE_IMAGE: GameShareImage = {
  path: "/images/boards/avalon.png",
  width: 811,
  height: 1940,
  alt: "Ảnh bìa game Avalon",
};

export function buildGameShareMetadata({
  title,
  description,
  path,
  image,
}: GameShareMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: "vi_VN",
      type: "website",
      images: [
        {
          url: image.path,
          width: image.width,
          height: image.height,
          alt: image.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: image.path,
          alt: image.alt,
        },
      ],
    },
  };
}
