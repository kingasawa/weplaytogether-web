"use client";

import Image from "next/image";
import { PlayerAvatarImage } from "@/components/ui/player-avatar-image";
import { frameGlassStyle, frameMaskStyle, frameTintStyle } from "@/lib/frame-mask-style";
import { getPlayerAvatarSrc } from "@/lib/player-avatars";
// Dùng LẠI đúng CSS module của hàng người chơi trong phòng chờ (wolf/page.module.css, dùng
// chung cho cả 3 game) — không copy riêng class nào sang đây, để khung/kính/glow/sparkle trong
// preview luôn render y hệt CSS thật của phòng chờ, tránh lệch hình khi đổi 1 bên quên đổi bên kia.
import lobbyStyles from "@/app/games/wolf/page.module.css";
import styles from "./player-row-preview.module.css";

export type PlayerRowPreviewProps = {
  name: string;
  avatarKey?: string | null;
  avatarUrl?: string | null;
  avatarFrameUrl?: string | null;
  profileFrameUrl?: string | null;
  profileFrameColor?: string | null;
};

// Xem trước 1 hàng người chơi trong phòng chờ (avatar + tên + khung avatar/khung thông tin) —
// dùng ở modal xem trước vật phẩm shop, tái sử dụng NGUYÊN cấu trúc DOM/class + FrameEffects
// (glow xoay/sparkle/flash) của .../rooms/[roomId]/*-room-lobby.tsx để "xem trước" và "thực tế
// trong phòng chờ" luôn khớp nhau tuyệt đối. Luôn bật hiệu ứng VIP (data-player-row-shine-card)
// khi có khung thông tin, vì mục đích của preview là cho thấy trọn vẹn khung sẽ trông ra sao khi
// trang bị.
export default function PlayerRowPreview({
  name,
  avatarKey,
  avatarUrl,
  avatarFrameUrl,
  profileFrameUrl,
  profileFrameColor = null,
}: PlayerRowPreviewProps) {
  const hasProfileFrame = Boolean(profileFrameUrl);

  return (
    <div className={styles.stage}>
      <article
        className={[lobbyStyles.playerRow, hasProfileFrame ? lobbyStyles.playerRowFramed : "", styles.row]
          .filter(Boolean)
          .join(" ")}
        data-player-row-shine-card={hasProfileFrame ? "" : undefined}
        style={frameTintStyle(profileFrameColor)}
      >
        {profileFrameUrl && (
          <>
            <span
              aria-hidden="true"
              className={lobbyStyles.playerRowFrameInnerGlass}
              style={frameGlassStyle(profileFrameColor)}
            />
            <span
              aria-hidden="true"
              className={lobbyStyles.playerRowFrameOverlay}
              style={{ backgroundImage: `url(${profileFrameUrl})` }}
            />
          </>
        )}
        {hasProfileFrame && profileFrameUrl && (
          <>
            <span aria-hidden="true" className={lobbyStyles.playerRowFrameGlow} style={frameMaskStyle(profileFrameUrl)} />
            <span
              aria-hidden="true"
              className={lobbyStyles.playerRowFrameFlash}
              data-frame-flash
              style={frameMaskStyle(profileFrameUrl)}
            />
            <span className={lobbyStyles.sparkle} data-frame-sparkle aria-hidden="true" />
            <span className={`${lobbyStyles.sparkle} ${lobbyStyles.sparkleB}`} data-frame-sparkle aria-hidden="true" />
            <span className={`${lobbyStyles.sparkle} ${lobbyStyles.sparkleC}`} data-frame-sparkle aria-hidden="true" />
            <span className={`${lobbyStyles.sparkle} ${lobbyStyles.sparkleD}`} data-frame-sparkle aria-hidden="true" />
            <span className={`${lobbyStyles.sparkle} ${lobbyStyles.sparkleE}`} data-frame-sparkle aria-hidden="true" />
            <span className={`${lobbyStyles.sparkle} ${lobbyStyles.sparkleF}`} data-frame-sparkle aria-hidden="true" />
            <span className={`${lobbyStyles.sparkle} ${lobbyStyles.sparkleG}`} data-frame-sparkle aria-hidden="true" />
            <span className={`${lobbyStyles.sparkle} ${lobbyStyles.sparkleH}`} data-frame-sparkle aria-hidden="true" />
          </>
        )}
        <div className={lobbyStyles.playerIdentity}>
          <span className={lobbyStyles.playerAvatarFrameWrap}>
            <PlayerAvatarImage
              alt=""
              aria-hidden="true"
              className={avatarFrameUrl ? `${lobbyStyles.playerAvatar} ${lobbyStyles.playerAvatarFramed}` : lobbyStyles.playerAvatar}
              width={48}
              height={48}
              src={getPlayerAvatarSrc(avatarKey, avatarUrl)}
              avatarKey={avatarKey}
            />
            {avatarFrameUrl && (
              <Image
                alt=""
                aria-hidden="true"
                className={lobbyStyles.playerAvatarFrameImg}
                width={64}
                height={64}
                src={avatarFrameUrl}
                unoptimized
              />
            )}
          </span>
          <div>
            <div className={lobbyStyles.playerNameLine}>
              <span className={lobbyStyles.playerNameActions}>
                <strong title={name}>{name.length > 12 ? `${name.slice(0, 12)}...` : name}</strong>
              </span>
            </div>
            <span>Đã sẵn sàng</span>
          </div>
        </div>
      </article>
    </div>
  );
}
