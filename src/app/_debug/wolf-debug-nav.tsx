"use client";

import { SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import styles from "./wolf-debug-nav.module.css";

export type WolfDebugNavItem = {
  href: string;
  label: string;
  isActive: boolean;
};

type WolfDebugNavProps = {
  title: string;
  items: WolfDebugNavItem[];
  otherGame: {
    href: string;
    label: string;
  };
};

export default function WolfDebugNav({ items, otherGame, title }: WolfDebugNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={styles.wrap}>
      {isOpen && (
        <nav className={styles.panel} aria-label="Chọn phase để xem UI">
          <span className={styles.title}>{title}</span>
          {items.map((item) => (
            <Link
              className={`${styles.link} ${item.isActive ? styles.linkActive : ""}`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
          <Link className={`${styles.link} ${styles.gameSwitch}`} href={otherGame.href}>
            {otherGame.label}
          </Link>
        </nav>
      )}
      <button
        aria-label={isOpen ? "Đóng danh sách phase" : "Mở danh sách phase"}
        className={styles.toggle}
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
      >
        {isOpen ? <X aria-hidden="true" /> : <SlidersHorizontal aria-hidden="true" />}
      </button>
    </div>
  );
}
