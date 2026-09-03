"use client";

import { HelpCircle, Languages, Menu, Settings, ShoppingBag, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/language-provider";
import { LOCALES, type Locale } from "@/i18n/locales";
import styles from "./page.module.css";

type MenuItem = {
  labelKey: "nav.shop" | "nav.settings" | "nav.leaderboard" | "nav.guide";
  icon: typeof Settings;
  href?: string;
};

const MENU_ITEMS: MenuItem[] = [
  { labelKey: "nav.shop", icon: ShoppingBag, href: "/shop" },
  { labelKey: "nav.settings", icon: Settings },
  { labelKey: "nav.leaderboard", icon: Trophy, href: "/board" },
  { labelKey: "nav.guide", icon: HelpCircle },
];

export default function HeaderMenu() {
  const { locale, setLocale, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function chooseLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    setIsOpen(false);
  }

  return (
    <div className={styles.headerMenuWrapper} ref={wrapperRef}>
      <button
        className={styles.menuButton}
        type="button"
        aria-label={t("nav.menu")}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Menu aria-hidden="true" />
      </button>

      {isOpen && (
        <div className={styles.headerMenuPanel}>
          {MENU_ITEMS.map(({ labelKey, icon: Icon, href }) =>
            href ? (
              <Link
                className={styles.headerMenuItem}
                href={href}
                key={labelKey}
                onClick={() => setIsOpen(false)}
              >
                <Icon aria-hidden="true" />
                {t(labelKey)}
              </Link>
            ) : (
              <button
                className={styles.headerMenuItem}
                type="button"
                key={labelKey}
                onClick={() => setIsOpen(false)}
              >
                <Icon aria-hidden="true" />
                {t(labelKey)}
              </button>
            )
          )}

          <div className={styles.languageMenuGroup} aria-label={t("nav.language")}>
            <span className={styles.languageMenuLabel}>
              <Languages aria-hidden="true" />
              {t("nav.language")}
            </span>
            <div className={styles.languageMenuOptions}>
              {LOCALES.map((nextLocale) => (
                <button
                  className={
                    nextLocale === locale
                      ? `${styles.languageMenuOption} ${styles.languageMenuOptionActive}`
                      : styles.languageMenuOption
                  }
                  type="button"
                  key={nextLocale}
                  aria-pressed={nextLocale === locale}
                  aria-label={
                    nextLocale === locale
                      ? `${t(`nav.language.${nextLocale}`)} - ${t("nav.language.current")}`
                      : t(`nav.language.${nextLocale}`)
                  }
                  onClick={() => chooseLocale(nextLocale)}
                >
                  {nextLocale.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
