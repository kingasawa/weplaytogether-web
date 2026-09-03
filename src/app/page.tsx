"use client";

import { FileText, Gamepad2, ShieldCheck, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useLanguage } from "@/i18n/language-provider";
import CardShine from "./card-shine";
import HeaderMenu from "./header-menu";
import IntroSection from "./intro-section";
import MobileAccountNavItem from "./mobile-account-nav-item";
import styles from "./page.module.css";

type FeaturedGame = {
  nameKey: TranslationKey;
  playersKey: TranslationKey;
  categoryKey: TranslationKey;
  image: string;
  href: string;
  featured?: boolean;
  dotDanger?: boolean;
};

const featuredGames: FeaturedGame[] = [
  {
    nameKey: "home.game.wolf.name",
    playersKey: "home.game.players.wolf",
    categoryKey: "home.game.category.deduction",
    image: "/images/boards/wolf.webp",
    href: "/games/wolf",
    featured: true,
  },
  {
    nameKey: "home.game.wolfClassic.name",
    playersKey: "home.game.players.wolfClassic",
    categoryKey: "home.game.category.deduction",
    image: "/images/boards/wolf-classic.webp",
    href: "/games/wolf-classic",
    featured: true,
  },
  {
    nameKey: "home.game.avalon.name",
    playersKey: "home.game.players.avalon",
    categoryKey: "home.game.category.roleplay",
    image: "/images/boards/avalon.webp",
    href: "/games/avalon",
  },
  {
    nameKey: "home.game.spy.name",
    playersKey: "home.game.players.spy",
    categoryKey: "home.game.category.deduction",
    image: "/images/boards/spy.webp",
    href: "#game-detail",
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
    <Link className={styles.gameCard} href={game.href} data-game-card>
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
            <HeaderMenu />
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
