import { FileText, Gamepad2, ShieldCheck, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import CardShine from "./card-shine";
import HeaderMenu from "./header-menu";
import MobileAccountNavItem from "./mobile-account-nav-item";
import styles from "./page.module.css";

type FeaturedGame = {
  name: string;
  players: string;
  category: string;
  image: string;
  href: string;
  featured?: boolean;
  dotDanger?: boolean;
};

const featuredGames: FeaturedGame[] = [
  {
    name: "Ma Sói Một Đêm",
    players: "3 - 10 người",
    category: "Suy luận",
    image: "/images/boards/wolf.png",
    href: "/games/wolf",
    featured: true,
  },
  {
    name: "Ma Sói Nhiều Đêm",
    players: "4 - 10 người",
    category: "Suy luận",
    image: "/images/boards/wolf-classic.png",
    href: "/games/wolf-classic",
    featured: true,
  },
  {
    name: "Avalon",
    players: "5 - 10 người",
    category: "Nhập vai",
    image: "/images/boards/avalon.png",
    href: "/games/avalon",
  },
  {
    name: "Ai Là Gián Điệp",
    players: "4 - 12 người",
    category: "Suy luận",
    image: "/images/boards/spy.png",
    href: "#game-detail",
    dotDanger: true,
  },
];

function Logo() {
  return (
    <Link className={styles.logo} href="/" aria-label="WE PLAY TOGETHER - Trang chủ">
      <span className={styles.logoIcon}>
        <Image
          alt="WE PLAY TOGETHER"
          width={44}
          height={44}
          src="/images/icon.png"
          priority
        />
      </span>
      <span className={styles.logoText}>
        <strong>WE PLAY</strong>
        <strong>TOGETHER</strong>
      </span>
    </Link>
  );
}

function GameCard({ game }: { game: FeaturedGame }) {
  return (
    <Link className={styles.gameCard} href={game.href} data-game-card>
      <div className={styles.gameCover}>
        <Image
          alt={`Ảnh bìa game ${game.name}`}
          fill
          sizes="72px"
          src={game.image}
        />
      </div>
      <div className={styles.gameDetails}>
        <h3>{game.name}</h3>
        <p>
          <UsersRound aria-hidden="true" />
          {game.players}
          <i
            aria-label="Đang có phòng chờ"
            className={game.dotDanger ? styles.dotDanger : undefined}
          />
        </p>
        <span>
          <Gamepad2 aria-hidden="true" />
          {game.category}
        </span>
      </div>
    </Link>
  );
}

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.frame}>
        <header className={styles.header}>
          <Logo />
          <div className={styles.headerActions}>
            <HeaderMenu />
            <MobileAccountNavItem />
          </div>
        </header>

        <div className={styles.contentShell}>
          <section className={styles.featuredGames} id="games">
            <div className={styles.gameList}>
              {featuredGames.map((game) => (
                <GameCard game={game} key={game.name} />
              ))}
            </div>
          </section>
        </div>

        <CardShine />

        <footer className={styles.legalFooter}>
          <p>Boardverse is available at weplaytogether.online.</p>
          <nav aria-label="Legal links">
            <Link href="/privacy-policy">
              <ShieldCheck aria-hidden="true" />
              Privacy Policy
            </Link>
            <span className={styles.footerDivider} aria-hidden="true">
              |
            </span>
            <Link href="/terms-of-service">
              <FileText aria-hidden="true" />
              Terms of Service
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
