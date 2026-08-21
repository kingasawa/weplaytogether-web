"use client";

import { ArrowLeft, LogIn, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { MAX_GUEST_PLAYER_NAME_LENGTH } from "@/lib/guest-player";
import type { PlayerAvatarKey } from "@/lib/player-avatars";
import { PlayerAvatarPicker } from "./wolf/player-avatar-picker";
import styles from "./wolf/page.module.css";

type RoomJoinScreenProps = {
  gameName: string;
  roomCode: string;
  themeClassName: string;
  titleId: string;
  signInHref: string;
  guestNameInputId: string;
  isEditingGuestProfile: boolean;
  isGuestFormOpen: boolean;
  guestNameInput: string;
  guestAvatarKey: PlayerAvatarKey;
  guestAvatarObjectKey: string | null;
  guestNameError: string;
  backLabel?: string;
  onBack: () => void;
  onShowGuestForm: () => void;
  onSubmitGuestName: (event: FormEvent<HTMLFormElement>) => void;
  onGuestNameInputChange: (value: string) => void;
  onSelectAvatar: (avatarKey: PlayerAvatarKey) => void;
  onSelectAvatarObjectKey: (avatarObjectKey: string | null) => void;
};

export default function RoomJoinScreen({
  gameName,
  roomCode,
  themeClassName,
  titleId,
  signInHref,
  guestNameInputId,
  isEditingGuestProfile,
  isGuestFormOpen,
  guestNameInput,
  guestAvatarKey,
  guestAvatarObjectKey,
  guestNameError,
  backLabel = "Quay lại phòng",
  onBack,
  onShowGuestForm,
  onSubmitGuestName,
  onGuestNameInputChange,
  onSelectAvatar,
  onSelectAvatarObjectKey,
}: RoomJoinScreenProps) {
  return (
    <main className={`${styles.page} ${styles.joinIdentityPage} ${themeClassName}`}>
      <section className={styles.joinIdentityPanel} aria-labelledby={titleId}>
        <button className={styles.joinIdentityBackButton} type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {backLabel}
        </button>

        <header className={styles.joinIdentityHeader}>
          <span className={styles.joinIdentityEyebrow}>
            <UsersRound aria-hidden="true" />
            Phòng {roomCode.toUpperCase()}
          </span>
          <h1 id={titleId}>
            {isEditingGuestProfile ? "Tên & avatar" : "Tham gia phòng"}
          </h1>
          <p>
            {isEditingGuestProfile
              ? `Cập nhật tên và avatar hiển thị trong phòng ${gameName}.`
              : `Chọn cách vào phòng ${gameName}.`}
          </p>
        </header>

        {!isEditingGuestProfile && (
          <div className={styles.joinIdentityActions}>
            <Link className={styles.primaryButton} href={signInHref}>
              <LogIn aria-hidden="true" />
              ĐĂNG NHẬP
            </Link>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={onShowGuestForm}
            >
              <UserRound aria-hidden="true" />
              CHƠI VỚI VAI TRÒ KHÁCH
            </button>
          </div>
        )}

        {isGuestFormOpen && (
          <form className={`${styles.guestForm} ${styles.joinIdentityForm}`} onSubmit={onSubmitGuestName}>
            <label htmlFor={guestNameInputId}>Tên hiển thị</label>
            <input
              autoFocus
              id={guestNameInputId}
              maxLength={MAX_GUEST_PLAYER_NAME_LENGTH}
              placeholder="Nhập tên của bạn"
              type="text"
              value={guestNameInput}
              onChange={(event) => onGuestNameInputChange(event.target.value)}
            />
            <PlayerAvatarPicker
              selectedAvatarKey={guestAvatarKey}
              selectedAvatarObjectKey={guestAvatarObjectKey}
              onSelectAvatar={onSelectAvatar}
              onSelectAvatarObjectKey={onSelectAvatarObjectKey}
            />
            {guestNameError && <span className={styles.errorText}>{guestNameError}</span>}
            <button className={styles.primaryButton} type="submit">
              LƯU VÀ TIẾP TỤC
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
