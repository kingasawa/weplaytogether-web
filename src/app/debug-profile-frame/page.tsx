import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PlayerAvatarImage } from "@/components/ui/player-avatar-image";
import FrameEffects from "@/components/ui/frame-effects";
import { frameMaskStyle } from "@/lib/frame-mask-style";
import { DEFAULT_PLAYER_AVATAR_KEY, getPlayerAvatarSrc } from "@/lib/player-avatars";
import { listAllProfileFrameShopItems } from "../_debug/profile-frame-debug-data";
import styles from "../games/wolf/page.module.css";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Debug Khung Thông Tin | WePlayTogether",
};

// Trang này gọi createSupabaseAdminClient() (cần secret Supabase phía server) — nếu để
// Next.js static-prerender lúc build, bước build trên CI (chỉ truyền biến NEXT_PUBLIC_*, không
// có secret server-side) sẽ throw "Missing Supabase server environment variables" và làm fail
// cả deploy (đã gặp lỗi này). force-dynamic buộc trang chỉ render lúc có request thật, khi đó
// server production đã có đủ env.
export const dynamic = "force-dynamic";

// Trang debug UI cho khung thông tin (shop_items.item_type=profile_frame): liệt kê MỌI khung
// đang có trong DB (kể cả is_active=false) và render bằng đúng markup/CSS của hàng người chơi
// thật (.playerRow*, xem wolf-room-lobby.tsx) để xem khung hiển thị đúng như trong phòng chờ
// thật, không phải bản mô phỏng riêng — sửa style ở đây phải sửa ở page.module.css dùng chung.
export default async function DebugProfileFramePage() {
  const { items, error } = await listAllProfileFrameShopItems();

  return (
    <main className={`${styles.page} ${styles.roomPage} ${styles.avalonTheme} ${styles.wolfThemeBg}`}>
      <section className={styles.roomPanel}>
        <header className={styles.roomHeaderBar}>
          <div className={styles.roomHeaderIdentity}>
            <strong className={styles.roomHeaderCode}>Debug · Khung thông tin</strong>
          </div>
          <Link className={styles.roomHeaderIconButton} href="/" aria-label="Về trang chủ">
            <ArrowLeft aria-hidden="true" />
          </Link>
        </header>

        {error && <p className={styles.inlineError}>Không tải được shop_items: {error}</p>}

        {!error && items && items.length === 0 && (
          <p className={styles.description}>Chưa có vật phẩm profile_frame nào trong shop_items.</p>
        )}

        {!error && items && items.length > 0 && (
          <>
            <div className={styles.playerListHeader}>
              <span>Khung thông tin trong shop</span>
              <span>{items.length}</span>
            </div>
            <FrameEffects />
            <div className={styles.playerList} aria-label="Danh sách khung thông tin">
              {items.map((item) => (
                <article
                  className={`${styles.playerRow} ${styles.playerRowFramed}`}
                  data-player-row-shine-card=""
                  key={item.id}
                >
                  <span aria-hidden="true" className={styles.playerRowFrameInnerGlass} />
                  <span
                    aria-hidden="true"
                    className={styles.playerRowFrameOverlay}
                    style={{ backgroundImage: `url(${item.image_url})` }}
                  />
                  <span
                    aria-hidden="true"
                    className={styles.playerRowFrameGlow}
                    style={frameMaskStyle(item.image_url)}
                  />
                  <span
                    aria-hidden="true"
                    className={styles.playerRowFrameFlash}
                    data-frame-flash
                    style={frameMaskStyle(item.image_url)}
                  />
                  <span className={styles.sparkle} data-frame-sparkle aria-hidden="true" />
                  <span
                    className={`${styles.sparkle} ${styles.sparkleB}`}
                    data-frame-sparkle
                    aria-hidden="true"
                  />
                  <span
                    className={`${styles.sparkle} ${styles.sparkleC}`}
                    data-frame-sparkle
                    aria-hidden="true"
                  />
                  <span
                    className={`${styles.sparkle} ${styles.sparkleD}`}
                    data-frame-sparkle
                    aria-hidden="true"
                  />
                  <div className={styles.playerIdentity}>
                    <span className={styles.playerAvatarFrameWrap}>
                      <PlayerAvatarImage
                        alt=""
                        aria-hidden="true"
                        className={styles.playerAvatar}
                        width={48}
                        height={48}
                        src={getPlayerAvatarSrc(DEFAULT_PLAYER_AVATAR_KEY, null)}
                        avatarKey={DEFAULT_PLAYER_AVATAR_KEY}
                      />
                    </span>
                    <div>
                      <div className={styles.playerNameLine}>
                        <span className={styles.playerNameActions}>
                          <strong>{item.name}</strong>
                        </span>
                      </div>
                      <span>
                        {item.price_coins} Xu{!item.is_active && " · đã ẩn khỏi shop"}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
