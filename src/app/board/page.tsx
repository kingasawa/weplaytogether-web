import { ArrowLeft, CircleUserRound, Coins, Star, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  getPlayerAvatarSrc,
  getUploadedPlayerAvatarUrl,
  isRemotePlayerAvatarSrc,
} from "@/lib/player-avatars";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import styles from "./board.module.css";

export const metadata: Metadata = {
  title: "Bảng xếp hạng | WE PLAY TOGETHER",
};

// Đọc dữ liệu qua service role tại request time — không được prerender tĩnh lúc build vì
// SUPABASE_SERVICE_ROLE_KEY không có ở build step (chỉ có ở runtime), và bảng xếp hạng
// luôn cần dữ liệu mới nhất chứ không phải bản đóng băng lúc build.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEADERBOARD_LIMIT = 50;

type LeaderboardRow = {
  id: string;
  display_name: string | null;
  avatar_key: string | null;
  avatar_object_key: string | null;
  total_points: number;
  total_coins: number;
};

type RankRow = {
  rank: number;
  name: string;
  points: number;
  coins: number;
  avatarSrc: string;
};

function formatNumber(value: number) {
  return value.toLocaleString("vi-VN");
}

async function getLeaderboardRows(): Promise<RankRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leaderboard")
    .select("id, display_name, avatar_key, avatar_object_key, total_points, total_coins")
    .gt("total_points", 0)
    .order("total_points", { ascending: false })
    .order("total_coins", { ascending: false })
    .limit(LEADERBOARD_LIMIT);

  if (error || !data) {
    return [];
  }

  return (data as LeaderboardRow[]).map((row, index) => ({
    rank: index + 1,
    name: row.display_name?.trim() || "Người chơi ẩn danh",
    points: row.total_points,
    coins: row.total_coins,
    avatarSrc: getPlayerAvatarSrc(row.avatar_key, getUploadedPlayerAvatarUrl(row.avatar_object_key)),
  }));
}

export default async function BoardPage() {
  const leaderboard = await getLeaderboardRows();

  return (
    <main className={styles.page}>
      <section className={styles.screen} aria-labelledby="board-title">
        <header className={styles.topBar}>
          <Link className={styles.iconButton} href="/" aria-label="Về trang chủ">
            <ArrowLeft aria-hidden="true" />
          </Link>
          <div className={styles.navTitle}>
            <h1 id="board-title">Bảng xếp hạng</h1>
          </div>
          <span aria-hidden="true" />
        </header>

        {leaderboard.length === 0 ? (
          <p className={styles.emptyState}>
            Chưa có ai ghi điểm. Thắng một ván Ma Sói khi đã đăng nhập để lên bảng xếp hạng!
          </p>
        ) : (
          <ol className={styles.list}>
            {leaderboard.map((row) => {
              const isTopThree = row.rank <= 3;

              return (
                <li
                  className={styles.row}
                  data-rank={isTopThree ? row.rank : undefined}
                  key={row.rank}
                >
                  <span className={styles.rank}>
                    {isTopThree ? (
                      <span className={styles.medal} data-rank={row.rank}>
                        <Star aria-hidden="true" />
                        <b>{row.rank}</b>
                      </span>
                    ) : (
                      <b className={styles.rankNumber}>{row.rank}</b>
                    )}
                  </span>

                  <span className={styles.avatar}>
                    {row.avatarSrc ? (
                      <Image
                        alt=""
                        height={36}
                        src={row.avatarSrc}
                        unoptimized={isRemotePlayerAvatarSrc(row.avatarSrc)}
                        width={36}
                      />
                    ) : (
                      <CircleUserRound aria-hidden="true" />
                    )}
                  </span>

                  <span className={styles.name}>{row.name}</span>

                  <span className={styles.scoreGroup}>
                    <span className={styles.score}>
                      <Trophy aria-hidden="true" />
                      {formatNumber(row.points)}
                    </span>
                    <span className={styles.coins}>
                      <Coins aria-hidden="true" />
                      {formatNumber(row.coins)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
