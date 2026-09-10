"use client";

import { FileText, Gamepad2, ShieldCheck, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useLanguage } from "@/i18n/language-provider";
import CardShine from "./card-shine";
import IntroSection from "./intro-section";
import MobileAccountNavItem from "./mobile-account-nav-item";
import styles from "./page.module.css";

type FeaturedGame = {
  nameKey: TranslationKey;
  playersKey: TranslationKey;
  categoryKey: TranslationKey;
  image: string;
  href: string;
  // Class tông màu riêng cho card, khớp với tông chủ đạo trong ảnh icon của game
  // (public/images/boards/*.png) — xem .gameCardWolf/.gameCardWolfClassic/... trong
  // page.module.css.
  toneClass: "gameCardWolf" | "gameCardWolfClassic" | "gameCardAvalon" | "gameCardSpy";
  featured?: boolean;
  dotDanger?: boolean;
};

const featuredGames: FeaturedGame[] = [
  {
    nameKey: "home.game.wolf.name",
    playersKey: "home.game.players.wolf",
    categoryKey: "home.game.category.deduction",
    image: "/images/boards/wolf.png",
    href: "/games/wolf",
    toneClass: "gameCardWolf",
    featured: true,
  },
  {
    nameKey: "home.game.wolfClassic.name",
    playersKey: "home.game.players.wolfClassic",
    categoryKey: "home.game.category.deduction",
    image: "/images/boards/wolf-classic.png",
    href: "/games/wolf-classic",
    toneClass: "gameCardWolfClassic",
    featured: true,
  },
  {
    nameKey: "home.game.avalon.name",
    playersKey: "home.game.players.avalon",
    categoryKey: "home.game.category.roleplay",
    image: "/images/boards/avalon.png",
    href: "/games/avalon",
    toneClass: "gameCardAvalon",
  },
  {
    nameKey: "home.game.spy.name",
    playersKey: "home.game.players.spy",
    categoryKey: "home.game.category.deduction",
    image: "/images/boards/spy.png",
    href: "#game-detail",
    toneClass: "gameCardSpy",
    dotDanger: true,
  },
];

function Logo() {
  const { t } = useLanguage();

  return (
    <Link className={styles.logo} href="/" aria-label={t("app.logoAria")}>
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
  const { t } = useLanguage();
  const gameName = t(game.nameKey);

  return (
    <Link
      className={`${styles.gameCard} ${styles[game.toneClass]}`}
      href={game.href}
      data-game-card
    >
      <span className={styles.gameCardShine} aria-hidden="true">
        <span className={styles.shineTop} />
        <span className={styles.shineRight} />
        <span className={styles.shineBottom} />
        <span className={styles.shineLeft} />
      </span>
      <div className={styles.gameCover}>
        <Image
          alt={t("home.game.coverAlt", { gameName })}
          width={96}
          height={96}
          loading="eager"
          sizes="(max-width: 480px) 22vw, 96px"
          src={game.image}
        />
      </div>
      <div className={styles.gameDetails}>
        <h3>{gameName}</h3>
        <p>
          <UsersRound aria-hidden="true" />
          {t(game.playersKey)}
          <i
            aria-label={t("home.game.waitingRoom")}
            className={game.dotDanger ? styles.dotDanger : undefined}
          />
        </p>
        <span>
          <Gamepad2 aria-hidden="true" />
          {t(game.categoryKey)}
        </span>
      </div>
    </Link>
  );
}

export default function Home() {
  const { t } = useLanguage();

  return (
    <div className={styles.page}>
      <main className={styles.frame}>
        <header className={styles.header}>
          <Logo />
          <div className={styles.headerActions}>
            <Link className={styles.headerIconLink} href="/shop" aria-label={t("nav.shop")}>
              <Image alt="" aria-hidden="true" width={38} height={38} src="/images/ui/shop.png" />
            </Link>
            <Link className={styles.headerIconLink} href="/board" aria-label={t("nav.leaderboard")}>
              <Image alt="" aria-hidden="true" width={38} height={38} src="/images/ui/bxh.png" />
            </Link>
            <MobileAccountNavItem />
          </div>
        </header>

        <div className={styles.contentShell}>
          <IntroSection />

          <section className={styles.featuredGames} id="games">
            <div className={styles.gameList}>
              {featuredGames.map((game) => (
                <GameCard game={game} key={game.nameKey} />
              ))}
            </div>
          </section>
        </div>

        <CardShine />

        <footer className={styles.legalFooter}>
          <nav aria-label="Legal links">
            <Link href="/privacy-policy">
              <ShieldCheck aria-hidden="true" />
              {t("nav.privacy")}
            </Link>
            <span className={styles.footerDivider} aria-hidden="true">
              |
            </span>
            <Link href="/terms-of-service">
              <FileText aria-hidden="true" />
              {t("nav.terms")}
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
