"use client";

import { LogOut, Pencil, X } from "lucide-react";
import { useId } from "react";
import styles from "./player-action-menu-modal.module.css";

export type PlayerActionMenuAction = {
  label: string;
  variant?: "default" | "danger";
  onSelect: () => void;
};

type PlayerActionMenuModalProps = {
  playerName: string;
  action: PlayerActionMenuAction;
  onClose: () => void;
};

// Modal dùng chung cho cả 3 game (wolf, wolf-classic, avalon) khi bấm vào 1 hàng người chơi
// trong phòng chờ: bấm vào chính mình -> action đổi tên/avatar; host bấm vào người khác -> action
// đuổi khỏi phòng. Chỉ 1 action button, không phải form phức tạp nên tách riêng khỏi
// GameBugReportDialog dù chung phong cách backdrop/modal.
export default function PlayerActionMenuModal({ playerName, action, onClose }: PlayerActionMenuModalProps) {
  const titleId = useId();

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.modal}
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <button aria-label="Đóng" className={styles.closeButton} type="button" onClick={onClose}>
          <X aria-hidden="true" />
        </button>

        <h2 id={titleId}>{playerName}</h2>

        <button
          className={action.variant === "danger" ? styles.dangerAction : styles.defaultAction}
          type="button"
          onClick={action.onSelect}
        >
          {action.variant === "danger" ? <LogOut aria-hidden="true" /> : <Pencil aria-hidden="true" />}
          {action.label}
        </button>
      </section>
    </div>
  );
}
