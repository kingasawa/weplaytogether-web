import {
  Bell,
  ChevronRight,
  Compass,
  Gamepad2,
  Globe2,
  House,
  Play,
  Search,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import MobileAccountNavItem from "./mobile-account-nav-item";
import styles from "./page.module.css";

type FeaturedGame = {
  name: string;
  players: string;
  category: string;
  image: string;
  href: string;
  featured?: boolean;
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
    category: "Suy luận",
    image: "/images/boards/avalon.png",
    href: "#game-detail",
  },
  {
    name: "Ai Là Gián Điệp",
    players: "4 - 12 người",
    category: "Nhập vai",
    image: "/images/boards/spy.png",
    href: "#game-detail",
  },
  {
    name: "Thám Tử Lừng Danh",
    players: "4 - 8 người",
    category: "Phá án",
    image: "/images/boards/detective.png",
    href: "#game-detail",
  },
];

const desktopNavigation = [
  { label: "Trang chủ", href: "/", active: true },
  { label: "Khám phá", href: "#games" },
  { label: "Bảng xếp hạng", href: "#ranking" },
  { label: "Cộng đồng", href: "#community" },
  { label: "Cửa hàng", href: "#store" },
];

const mobileNavigation = [
  { label: "Trang chủ", href: "/", icon: House, active: true },
  { label: "Khám phá", href: "#games", icon: Compass },
  { label: "Cộng đồng", href: "#community", icon: UsersRound },
  { label: "Thông báo", href: "#notifications", icon: Bell },
];

function Logo() {
  return (
    <Link className={styles.logo} href="/" aria-label="Boardverse - Trang chủ">
      <span className={styles.logoIcon}>
        <Gamepad2 aria-hidden="true" />
      </span>
      <span>
        <strong>BOARDVERSE</strong>
        <small>WE PLAY TOGETHER</small>
      </span>
    </Link>
  );
}

function SectionHeading({
  title,
  href,
  showLink = true,
}: {
  title: string;
  href: string;
  showLink?: boolean;
}) {
  return (
    <div className={styles.sectionHeading}>
      <h2>{title}</h2>
      {showLink && (
        <Link href={href}>
          Xem tất cả
          <ChevronRight aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function GameCard({ game }: { game: FeaturedGame }) {
  return (
    <Link className={styles.gameCard} href={game.href}>
      <div className={styles.gameCover}>
        {game.featured && <span className={styles.hotBadge}>HOT</span>}
        <Image
          alt={`Ảnh bìa game ${game.name}`}
          fill
          sizes="(max-width: 767px) 44vw, 25vw"
          src={game.image}
        />
      </div>
      <div className={styles.gameDetails}>
        <h3>{game.name}</h3>
        <p>
          <UsersRound aria-hidden="true" />
          {game.players}
          <i aria-label="Đang có phòng chờ" />
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
    <main className={styles.page}>
      <header className={styles.header}>
        <Logo />

        <nav className={styles.desktopNav} aria-label="Điều hướng chính">
          {desktopNavigation.map((item) => (
            <Link
              className={item.active ? styles.activeNav : undefined}
              href={item.href}
              key={item.label}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <label className={styles.searchBox}>
            <span className={styles.srOnly}>Tìm game, thể loại</span>
            <input placeholder="Tìm game, thể loại..." type="search" />
            <Search aria-hidden="true" />
          </label>
          <button className={styles.iconButton} type="button" aria-label="Đổi ngôn ngữ">
            <Globe2 aria-hidden="true" />
          </button>
          <Link className={styles.loginButton} href="#login">
            Đăng nhập
          </Link>
          <Link className={styles.signupButton} href="#signup">
            Đăng ký
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>
            <Trophy aria-hidden="true" />
            Cùng nhau tạo cuộc vui
          </p>
          <h1>
            <span className={styles.heroTitleLine}>WE PLAY</span>
            <span className={styles.heroTitleAccent}>TOGETHER</span>
          </h1>
          <p className={styles.heroDescription}>
            Nền tảng board game online hàng đầu.
            <br />
            Chơi cùng bạn bè, kết nối mọi niềm vui!
          </p>
          <div className={styles.heroButtons}>
            <Link className={styles.primaryButton} href="#games">
              <Gamepad2 aria-hidden="true" />
              Chơi ngay
            </Link>
            <Link className={styles.secondaryButton} href="#games">
              <Compass aria-hidden="true" />
              Khám phá game
            </Link>
          </div>
          <div className={styles.onlinePlayers}>
            <div className={styles.avatarStack} aria-hidden="true">
              <span>
                <UserRound />
              </span>
              <span>
                <UserRound />
              </span>
              <span>
                <UserRound />
              </span>
              <span>
                <UserRound />
              </span>
            </div>
            <strong>128K+</strong>
            <span>người chơi đang online</span>
          </div>
        </div>

        <div className={styles.heroArt}>
          <Image
            alt="Nhóm bạn đang cùng chơi board game"
            fill
            priority
            sizes="(max-width: 767px) 100vw, 62vw"
            src="/images/hero-banner.png"
          />
        </div>
      </section>

      <div className={styles.contentShell}>
        <section className={styles.featuredGames} id="games">
          <SectionHeading
            title="Danh sách game"
            href="#games"
            showLink={featuredGames.length >= 5}
          />
          <div className={styles.gameList}>
            {featuredGames.map((game) => (
              <GameCard game={game} key={game.name} />
            ))}
          </div>
        </section>

        <section className={styles.communityBanner} id="community">
          <div>
            <span className={styles.communityIcon}>
              <UsersRound aria-hidden="true" />
            </span>
            <div>
              <p>Không chỉ là một ván game</p>
              <h2>Tìm đồng đội. Tạo phòng. Chơi hết mình.</h2>
            </div>
          </div>
          <Link className={styles.secondaryButton} href="#create-room">
            <Play aria-hidden="true" />
            Tạo phòng ngay
          </Link>
        </section>
      </div>

      <nav className={styles.mobileNav} aria-label="Điều hướng mobile">
        {mobileNavigation.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              className={item.active ? styles.activeMobileNav : undefined}
              href={item.href}
              key={item.label}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <MobileAccountNavItem />
      </nav>
    </main>
  );
}
