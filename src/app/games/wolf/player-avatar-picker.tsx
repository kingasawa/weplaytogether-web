"use client";

import Image from "next/image";
import {
  getPlayerAvatarPath,
  PLAYER_AVATAR_KEYS,
  type PlayerAvatarKey,
} from "@/lib/player-avatars";
import styles from "./page.module.css";

type PlayerAvatarPickerProps = {
  selectedAvatarKey: PlayerAvatarKey;
  onSelectAvatar: (avatarKey: PlayerAvatarKey) => void;
};

export function PlayerAvatarPicker({
  selectedAvatarKey,
  onSelectAvatar,
}: PlayerAvatarPickerProps) {
  return (
    <fieldset className={styles.avatarPicker}>
      <legend>Chọn avatar</legend>
      <div className={styles.avatarGrid}>
        {PLAYER_AVATAR_KEYS.map((avatarKey) => {
          const isSelected = avatarKey === selectedAvatarKey;

          return (
            <button
              aria-label={`Chọn avatar ${avatarKey}`}
              aria-pressed={isSelected}
              className={isSelected ? styles.avatarOptionActive : styles.avatarOption}
              key={avatarKey}
              type="button"
              onClick={() => onSelectAvatar(avatarKey)}
            >
              <Image
                alt=""
                aria-hidden="true"
                width={56}
                height={56}
                src={getPlayerAvatarPath(avatarKey)}
              />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
