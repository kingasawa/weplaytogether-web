"use client";

import { HelpCircle, Menu, Settings, ShoppingBag, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

type MenuItem = {
  label: string;
  icon: typeof Settings;
  href?: string;
};

const MENU_ITEMS: MenuItem[] = [
  { label: "Cửa hàng", icon: ShoppingBag, href: "/shop" },
  { label: "Cài đặt", icon: Settings },
  { label: "Bảng xếp hạng", icon: Trophy, href: "/board" },
  { label: "Hướng dẫn chơi", icon: HelpCircle },
];

export default function HeaderMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Đóng menu khi bấm ra ngoài hoặc nhấn Escape.
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

  return (
    <div className={styles.headerMenuWrapper} ref={wrapperRef}>
      <button
        className={styles.menuButton}
        type="button"
        aria-label="Menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Menu aria-hidden="true" />
      </button>

      {isOpen && (
        <div className={styles.headerMenuPanel}>
          {MENU_ITEMS.map(({ label, icon: Icon, href }) =>
            href ? (
              <Link
                className={styles.headerMenuItem}
                href={href}
                key={label}
                onClick={() => setIsOpen(false)}
              >
                <Icon aria-hidden="true" />
                {label}
              </Link>
            ) : (
              <button
                className={styles.headerMenuItem}
                type="button"
                key={label}
                onClick={() => setIsOpen(false)}
              >
                <Icon aria-hidden="true" />
                {label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
