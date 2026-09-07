import Image from "next/image";
import { Copy, LogOut, Pencil, ShieldCheck, Users } from "lucide-react";
import styles from "./page.module.css";

type DemoPlayer = {
  id: string;
  name: string;
  avatar: string;
  avatarFrame: string | null;
  isCurrent?: boolean;
  isHost?: boolean;
  isOnline?: boolean;
  isReady?: boolean;
  profileFrame?: string | null;
};

const demoPlayers: DemoPlayer[] = [
  {
    id: "1",
    name: "Khánh",
    avatar: "/images/avatars/avatar0.webp",
    avatarFrame: "/images/frames/avatar/01.webp",
    isCurrent: true,
    isHost: true,
    isOnline: true,
    isReady: true,
    profileFrame: "/images/frames/info/01.webp",
  },
  {
    id: "2",
    name: "Yun",
    avatar: "/images/avatars/img_2.webp",
    avatarFrame: "/images/frames/avatar/03.webp",
    isOnline: true,
    isReady: true,
    profileFrame: "/images/frames/info/01.webp",
  },
  {
    id: "3",
    name: "Ngọc Anh",
    avatar: "/images/avatars/img_5.webp",
    avatarFrame: null,
    isOnline: true,
    isReady: false,
    profileFrame: null,
  },
  {
    id: "4",
    name: "Dương",
    avatar: "/images/avatars/img_7.webp",
    avatarFrame: "/images/frames/avatar/06.webp",
    isOnline: false,
    isReady: false,
    profileFrame: "/images/frames/info/01.webp",
  },
  {
    id: "5",
    name: "Minh Quân",
    avatar: "/images/avatars/img_11.webp",
    avatarFrame: null,
    isOnline: true,
    isReady: true,
    profileFrame: null,
  },
  {
    id: "6",
    name: "Lan",
    avatar: "/images/avatars/img_15.webp",
    avatarFrame: "/images/frames/avatar/09.webp",
    isOnline: true,
    isReady: false,
    profileFrame: "/images/frames/info/01.webp",
  },
];

export default function DebugLobbyTwoColumnPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.kicker}>Demo phòng chờ</span>
          <h1>Ma Sói Một Đêm</h1>
          <p>Layout thử nghiệm: mỗi hàng hiển thị 2 người chơi.</p>
        </div>
        <button className={styles.exitButton} type="button" aria-label="Thoát phòng">
          <LogOut aria-hidden="true" />
        </button>
      </header>

      <section className={styles.roomBar} aria-label="Thông tin phòng">
        <div>
          <span>Mã phòng</span>
          <strong>abcd</strong>
        </div>
        <button className={styles.iconButton} type="button" aria-label="Sao chép mã phòng">
          <Copy aria-hidden="true" />
        </button>
      </section>

      <section className={styles.playersSection} aria-labelledby="players-title">
        <div className={styles.playersHeader}>
          <div>
            <span>Danh sách</span>
            <h2 id="players-title">Người chơi</h2>
          </div>
          <span className={styles.countBadge}>
            <Users aria-hidden="true" />
            {demoPlayers.length}/10
          </span>
        </div>

        <div className={styles.playersGrid}>
          {demoPlayers.map((player) => (
            <article
              className={`${styles.playerTile} ${player.profileFrame ? styles.playerTileFramed : ""}`}
              key={player.id}
            >
              {player.profileFrame && (
                <Image
                  alt=""
                  aria-hidden="true"
                  className={styles.infoFrame}
                  fill
                  sizes="14rem"
                  src={player.profileFrame}
                  unoptimized
                />
              )}

              <span className={styles.glass} aria-hidden="true" />

              <div className={styles.avatarDock}>
                <Image
                  alt=""
                  aria-hidden="true"
                  className={styles.avatar}
                  width={72}
                  height={72}
                  src={player.avatar}
                />
                {player.avatarFrame && (
                  <Image
                    alt=""
                    aria-hidden="true"
                    className={styles.avatarFrame}
                    width={96}
                    height={96}
                    src={player.avatarFrame}
                    unoptimized
                  />
                )}
              </div>

              <div className={styles.playerInfo}>
                <div className={styles.nameLine}>
                  <strong>{player.name}</strong>
                  {player.isCurrent && (
                    <button className={styles.editButton} type="button" aria-label="Đổi tên và avatar">
                      <Pencil aria-hidden="true" />
                    </button>
                  )}
                </div>
                <span className={player.isReady ? styles.readyText : styles.waitingText}>
                  {player.isReady ? "Đã sẵn sàng" : "Chưa sẵn sàng"}
                </span>
              </div>

              <div className={styles.tileMeta}>
                {player.isHost && (
                  <span className={styles.hostPill}>
                    <ShieldCheck aria-hidden="true" />
                    Chủ phòng
                  </span>
                )}
                <span className={player.isOnline ? styles.onlinePill : styles.offlinePill}>
                  {player.isOnline ? "Online" : "Đã thoát"}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
