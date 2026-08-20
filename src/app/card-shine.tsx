"use client";

import { useEffect } from "react";

/**
 * Điều phối hiệu ứng shine: mỗi 5–10s chọn NGẪU NHIÊN 1 card game để chạy
 * 1 vòng shine rồi dừng — chỉ 1 card tại một thời điểm.
 */
export default function CardShine() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let timer: number;
    let activeCard: HTMLElement | null = null;

    const clearActive = () => {
      if (activeCard) {
        activeCard.removeAttribute("data-shine");
        activeCard = null;
      }
    };

    const runOnce = () => {
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>("[data-game-card]")
      );

      if (cards.length === 0) {
        schedule();
        return;
      }

      const card = cards[Math.floor(Math.random() * cards.length)];
      activeCard = card;
      card.setAttribute("data-shine", "on");

      const onEnd = () => {
        card.removeEventListener("animationend", onEnd);
        window.clearTimeout(fallback);
        clearActive();
        schedule();
      };

      // animationend của ::before nổi bọt lên card
      card.addEventListener("animationend", onEnd);
      // dự phòng nếu animationend không kích hoạt
      const fallback = window.setTimeout(onEnd, 2000);
    };

    const schedule = () => {
      const delay = 5000 + Math.random() * 5000; // 5–10s
      timer = window.setTimeout(runOnce, delay);
    };

    schedule();

    return () => {
      window.clearTimeout(timer);
      clearActive();
    };
  }, []);

  return null;
}
