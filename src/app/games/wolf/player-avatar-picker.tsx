"use client";

import { ImageUp, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { ChangeEvent, useRef, useState } from "react";
import { optimizePlayerAvatarImage } from "@/lib/player-avatar-image";
import {
  PLAYER_AVATAR_SOURCE_MAX_BYTES,
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

    if (file.size <= 0 || file.size > PLAYER_AVATAR_SOURCE_MAX_BYTES) {
      setUploadError("Ảnh avatar phải nhỏ hơn 15MB.");
      return;
    }

    setIsUploading(true);

    try {
      // Thu nhỏ + nén về WebP nhỏ gọn trước khi upload (avatar không cần độ phân giải cao).
      const optimizedFile = await optimizePlayerAvatarImage(file);

      if (optimizedFile.size > PLAYER_AVATAR_UPLOAD_MAX_BYTES) {
        setUploadError("Không thể nén ảnh đủ nhỏ. Hãy chọn ảnh khác.");
        return;
      }

      const formData = new FormData();
      formData.set(PLAYER_AVATAR_UPLOAD_FIELD_NAME, optimizedFile);

      if (selectedAvatarObjectKey) {
        formData.set(PREVIOUS_PLAYER_AVATAR_OBJECT_KEY_FIELD_NAME, selectedAvatarObjectKey);
      }

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
      <legend>Chọn avatar</legend>
      {onSelectAvatarObjectKey && (
        <input
          ref={avatarFileInputRef}
          className={styles.avatarFileInput}
          type="file"
          accept={PLAYER_AVATAR_UPLOAD_ACCEPT}
          onChange={uploadAvatar}
        />
      )}
      <div className={styles.avatarGrid}>
        {onSelectAvatarObjectKey && (
          <button
            aria-label={selectedAvatarObjectKey ? "Đổi ảnh đã tải lên" : "Tải ảnh lên"}
            aria-pressed={Boolean(selectedAvatarObjectKey)}
            className={selectedAvatarObjectKey ? styles.avatarOptionActive : styles.avatarOption}
            type="button"
            disabled={isUploading}
            onClick={() => avatarFileInputRef.current?.click()}
          >
            {isUploading ? (
              <LoaderCircle className={styles.avatarUploadSpinner} aria-hidden="true" />
            ) : selectedUploadedAvatarUrl ? (
              <Image alt="" aria-hidden="true" width={56} height={56} src={selectedUploadedAvatarUrl} />
            ) : (
              <ImageUp aria-hidden="true" />
            )}
          </button>
        )}
        {PLAYER_AVATAR_KEYS.map((avatarKey) => {
          const isSelected = !selectedAvatarObjectKey && avatarKey === selectedAvatarKey;

          return (
            <button
              aria-label={`Chọn avatar ${avatarKey}`}
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
      {onSelectAvatarObjectKey && uploadError && (
        <span className={styles.errorText}>{uploadError}</span>
      )}
    </fieldset>
  );
}
