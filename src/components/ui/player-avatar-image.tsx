"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { getPlayerAvatarPath, isRemotePlayerAvatarSrc } from "@/lib/player-avatars";

type PlayerAvatarImageProps = Omit<ImageProps, "src" | "onError" | "unoptimized"> & {
  src: string;
  // avatarKey preset dùng làm ảnh mặc định để rơi về nếu src (Google/GCS) load lỗi.
  avatarKey?: string | null;
};

// Avatar Google/GCS thỉnh thoảng hiện icon ảnh vỡ ngay sau khi đăng nhập rồi tự hết khi
// refresh trang (CDN Google đôi khi từ chối/timeout request đầu tiên). Component này rơi về
// avatar preset mặc định ngay khi load lỗi, thay vì hiện icon vỡ.
export function PlayerAvatarImage({ src, avatarKey, alt, ...props }: PlayerAvatarImageProps) {
  const [hasFailed, setHasFailed] = useState(false);

  const effectiveSrc = hasFailed ? getPlayerAvatarPath(avatarKey) : src;

  return (
    <Image
      {...props}
      alt={alt}
      src={effectiveSrc}
      unoptimized={isRemotePlayerAvatarSrc(effectiveSrc)}
      onError={() => setHasFailed(true)}
    />
  );
}
