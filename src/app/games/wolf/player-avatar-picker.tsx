"use client";

import { ImageUp, LoaderCircle, Trash2 } from "lucide-react";
import Image from "next/image";
import { ChangeEvent, useRef, useState } from "react";
import {
  PLAYER_AVATAR_UPLOAD_ACCEPT,
  PLAYER_AVATAR_UPLOAD_FIELD_NAME,
  PLAYER_AVATAR_UPLOAD_MAX_BYTES,
  PREVIOUS_PLAYER_AVATAR_OBJECT_KEY_FIELD_NAME,
} from "@/lib/player-avatar-upload";
import {
  getPlayerAvatarPath,
  getUploadedPlayerAvatarUrl,
  PLAYER_AVATAR_KEYS,
  type PlayerAvatarKey,
} from "@/lib/player-avatars";
import styles from "./page.module.css";

type PlayerAvatarPickerProps = {
  selectedAvatarKey: PlayerAvatarKey;
  selectedAvatarObjectKey?: string | null;
  onSelectAvatar: (avatarKey: PlayerAvatarKey) => void;
  onSelectAvatarObjectKey?: (avatarObjectKey: string | null) => void;
};

export function PlayerAvatarPicker({
  selectedAvatarKey,
  selectedAvatarObjectKey = null,
  onSelectAvatar,
  onSelectAvatarObjectKey,
}: PlayerAvatarPickerProps) {
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const selectedUploadedAvatarUrl = getUploadedPlayerAvatarUrl(selectedAvatarObjectKey);

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file || !onSelectAvatarObjectKey) {
      return;
    }

    setUploadError("");

    if (file.size <= 0 || file.size > PLAYER_AVATAR_UPLOAD_MAX_BYTES) {
      setUploadError("Anh avatar phai nho hon 2MB.");
      return;
    }

    const formData = new FormData();
    formData.set(PLAYER_AVATAR_UPLOAD_FIELD_NAME, file);

    if (selectedAvatarObjectKey) {
      formData.set(PREVIOUS_PLAYER_AVATAR_OBJECT_KEY_FIELD_NAME, selectedAvatarObjectKey);
    }

    setIsUploading(true);

    try {
      const response = await fetch("/api/player-avatar", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        objectKey?: string;
      } | null;

      if (!response.ok || !payload?.objectKey) {
        setUploadError(payload?.error ?? "Khong the tai avatar len.");
        return;
      }

      onSelectAvatarObjectKey(payload.objectKey);
    } finally {
      setIsUploading(false);
    }
  }

  function choosePresetAvatar(avatarKey: PlayerAvatarKey) {
    onSelectAvatarObjectKey?.(null);
    onSelectAvatar(avatarKey);
  }

  return (
    <fieldset className={styles.avatarPicker}>
      <legend>Chon avatar</legend>
      {onSelectAvatarObjectKey && (
        <div className={styles.avatarUploadPanel}>
          {selectedUploadedAvatarUrl && (
            <div className={styles.avatarUploadPreview}>
              <Image
                alt=""
                aria-hidden="true"
                height={56}
                src={selectedUploadedAvatarUrl}
                width={56}
              />
              <span>Avatar da tai len</span>
            </div>
          )}
          <div className={styles.avatarUploadActions}>
            <input
              ref={avatarFileInputRef}
              className={styles.avatarFileInput}
              type="file"
              accept={PLAYER_AVATAR_UPLOAD_ACCEPT}
              onChange={uploadAvatar}
            />
            <button
              className={styles.avatarUploadButton}
              type="button"
              disabled={isUploading}
              onClick={() => avatarFileInputRef.current?.click()}
            >
              {isUploading ? <LoaderCircle aria-hidden="true" /> : <ImageUp aria-hidden="true" />}
              {selectedAvatarObjectKey ? "DOI ANH" : "TAI ANH"}
            </button>
            {selectedAvatarObjectKey && (
              <button
                className={styles.avatarUploadRemoveButton}
                type="button"
                disabled={isUploading}
                onClick={() => onSelectAvatarObjectKey(null)}
              >
                <Trash2 aria-hidden="true" />
                GO ANH
              </button>
            )}
          </div>
          {uploadError && <span className={styles.errorText}>{uploadError}</span>}
        </div>
      )}
      <div className={styles.avatarGrid}>
        {PLAYER_AVATAR_KEYS.map((avatarKey) => {
          const isSelected = !selectedAvatarObjectKey && avatarKey === selectedAvatarKey;

          return (
            <button
              aria-label={`Chon avatar ${avatarKey}`}
              aria-pressed={isSelected}
              className={isSelected ? styles.avatarOptionActive : styles.avatarOption}
              key={avatarKey}
              type="button"
              onClick={() => choosePresetAvatar(avatarKey)}
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
