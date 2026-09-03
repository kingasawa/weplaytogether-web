"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useLanguage } from "@/i18n/language-provider";
import styles from "./page.module.css";

export default function IntroSection() {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className={styles.intro} aria-label={t("home.intro.aria")}>
      <p>
        <strong>WePlayTogether</strong> {t("home.intro.short")}
      </p>

      {isExpanded && (
        <p id="intro-more">
          {t("home.intro.more")} <Link href="/privacy-policy">{t("nav.privacy")}</Link>.
        </p>
      )}

      <button
        className={styles.introToggle}
        type="button"
        aria-expanded={isExpanded}
        aria-controls="intro-more"
        onClick={() => setIsExpanded((current) => !current)}
      >
        {isExpanded ? t("home.intro.collapse") : t("home.intro.expand")}
        <span className={isExpanded ? styles.introToggleIconOpen : styles.introToggleIcon}>
          <ChevronDown aria-hidden="true" />
        </span>
      </button>
    </section>
  );
}
