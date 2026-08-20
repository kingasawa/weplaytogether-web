import { ArrowLeft, CircleUserRound, Star, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "./board.module.css";

export const metadata: Metadata = {
  title: "Bảng xếp hạng | WE PLAY TOGETHER",
};

type RankRow = {
  rank: number;
  name: string;
  score: number;
};

const leaderboard: RankRow[] = [
  { rank: 1, name: "USERNAME_01", score: 9822934 },
  { rank: 2, name: "USERNAME_02", score: 8824935 },
  { rank: 3, name: "USERNAME_03", score: 8225632 },
  { rank: 4, name: "USERNAME_04", score: 6219328 },
  { rank: 5, name: "USERNAME_05", score: 5432932 },
  { rank: 6, name: "USERNAME_06", score: 2024556 },
  { rank: 7, name: "USERNAME_07", score: 1009344 },
  { rank: 8, name: "USERNAME_08", score: 982293 },
  { rank: 9, name: "USERNAME_09", score: 764120 },
  { rank: 10, name: "USERNAME_10", score: 512088 },
];

function formatScore(score: number) {
  return score.toLocaleString("vi-VN");
}

export default function BoardPage() {
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
                  <CircleUserRound aria-hidden="true" />
                </span>

                <span className={styles.name}>{row.name}</span>

                <span className={styles.score}>
                  <Trophy aria-hidden="true" />
                  {formatScore(row.score)}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
