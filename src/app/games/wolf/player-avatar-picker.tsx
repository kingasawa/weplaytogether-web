"use client";

import { ImageUp, LoaderCircle, X } from "lucide-react";
import Image from "next/image";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  addStoredGuestPlayerAvatarUpload,
  readStoredGuestPlayerAvatarUploads,
  removeStoredGuestPlayerAvatarUpload,
} from "@/lib/guest-player";
import { optimizePlayerAvatarImage } from "@/lib/player-avatar-image";
import {
  PLAYER_AVATAR_MAX_UPLOADS,
  PLAYER_AVATAR_SOURCE_MAX_BYTES,
  PLAYER_AVATAR_UPLOAD_ACCEPT,
  PLAYER_AVATAR_UPLOAD_FIELD_NAME,
  PLAYER_AVATAR_UPLOAD_MAX_BYTES,
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
  const isUploadEnabled = Boolean(onSelectAvatarObjectKey);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadedObjectKeys, setUploadedObjectKeys] = useState<string[]>(() =>
    isUploadEnabled ? readStoredGuestPlayerAvatarUploads() : []
  );
  const [deletingObjectKey, setDeletingObjectKey] = useState<string | null>(null);
  const hasReachedUploadLimit = uploadedObjectKeys.length >= PLAYER_AVATAR_MAX_UPLOADS;

  // Đọc bộ sưu tập avatar đã upload từ localStorage khi mở picker.
  useEffect(() => {
    if (!isUploadEnabled) {
      return;
    }

    const syncTimer = window.setTimeout(() => setUploadedObjectKeys(readStoredGuestPlayerAvatarUploads()), 0);
    return () => window.clearTimeout(syncTimer);
  }, [isUploadEnabled]);

  // Đảm bảo avatar đang được chọn (kể cả dữ liệu cũ trước tính năng này) cũng có trong bộ sưu tập.
  useEffect(() => {
    if (!isUploadEnabled || !selectedAvatarObjectKey) {
      return;
    }

    const syncTimer = window.setTimeout(
      () =>
        setUploadedObjectKeys((current) =>
          current.includes(selectedAvatarObjectKey)
            ? current
            : addStoredGuestPlayerAvatarUpload(selectedAvatarObjectKey)
        ),
      0
    );
    return () => window.clearTimeout(syncTimer);
  }, [isUploadEnabled, selectedAvatarObjectKey]);

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file || !onSelectAvatarObjectKey) {
      return;
    }

    setUploadError("");

    if (hasReachedUploadLimit) {
      setUploadError(`Tối đa ${PLAYER_AVATAR_MAX_UPLOADS} ảnh. Hãy xóa bớt trước khi tải thêm.`);
      return;
    }

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

      const response = await fetch("/api/player-avatar", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        objectKey?: string;
      } | null;

      if (!response.ok || !payload?.objectKey) {
        setUploadError(payload?.error ?? "Không thể tải avatar lên.");
        return;
      }

      setUploadedObjectKeys(addStoredGuestPlayerAvatarUpload(payload.objectKey));
      onSelectAvatarObjectKey(payload.objectKey);
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteUploadedAvatar(objectKey: string) {
    if (!onSelectAvatarObjectKey) {
      return;
    }

    setUploadError("");
    setDeletingObjectKey(objectKey);

    try {
      const response = await fetch("/api/player-avatar", {
        body: JSON.stringify({ objectKey }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setUploadError(payload?.error ?? "Không thể xóa avatar.");
        return;
      }

      setUploadedObjectKeys(removeStoredGuestPlayerAvatarUpload(objectKey));

      if (selectedAvatarObjectKey === objectKey) {
        onSelectAvatarObjectKey(null);
      }
    } finally {
      setDeletingObjectKey(null);
    }
  }

  function choosePresetAvatar(avatarKey: PlayerAvatarKey) {
    onSelectAvatarObjectKey?.(null);
    onSelectAvatar(avatarKey);
  }

  return (
    <fieldset className={styles.avatarPicker}>
      <legend>Chọn avatar</legend>
      {isUploadEnabled && (
        <input
          ref={avatarFileInputRef}
          className={styles.avatarFileInput}
          type="file"
          accept={PLAYER_AVATAR_UPLOAD_ACCEPT}
          onChange={uploadAvatar}
        />
      )}
      <div className={styles.avatarGrid}>
        {isUploadEnabled && (
          <button
            aria-label={hasReachedUploadLimit ? "Đã đạt tối đa ảnh tải lên" : "Tải ảnh lên"}
            className={styles.avatarOption}
            type="button"
            disabled={isUploading || hasReachedUploadLimit}
            onClick={() => avatarFileInputRef.current?.click()}
          >
            {isUploading ? (
              <LoaderCircle className={styles.avatarUploadSpinner} aria-hidden="true" />
            ) : (
              <ImageUp aria-hidden="true" />
            )}
          </button>
        )}
        {isUploadEnabled &&
          uploadedObjectKeys.map((objectKey) => {
            const uploadedAvatarUrl = getUploadedPlayerAvatarUrl(objectKey);

            if (!uploadedAvatarUrl) {
              return null;
            }

            const isSelected = selectedAvatarObjectKey === objectKey;
            const isDeleting = deletingObjectKey === objectKey;

            return (
              <div className={styles.avatarUploadedItem} key={objectKey}>
                <button
                  aria-label="Chọn avatar đã tải lên"
                  aria-pressed={isSelected}
                  className={isSelected ? styles.avatarOptionActive : styles.avatarOption}
                  type="button"
                  disabled={isUploading || isDeleting}
                  onClick={() => onSelectAvatarObjectKey?.(objectKey)}
                >
                  <Image alt="" aria-hidden="true" width={56} height={56} src={uploadedAvatarUrl} />
                </button>
                <button
                  aria-label="Xóa avatar đã tải lên"
                  className={styles.avatarDeleteButton}
                  type="button"
                  disabled={isUploading || isDeleting}
                  onClick={() => deleteUploadedAvatar(objectKey)}
                >
                  {isDeleting ? (
                    <LoaderCircle className={styles.avatarUploadSpinner} aria-hidden="true" />
                  ) : (
                    <X aria-hidden="true" />
                  )}
                </button>
              </div>
            );
          })}
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
      {isUploadEnabled && uploadError && (
        <span className={styles.errorText}>{uploadError}</span>
      )}
      {isUploadEnabled && !uploadError && hasReachedUploadLimit && (
        <span className={styles.avatarUploadHint}>
          Đã đạt tối đa {PLAYER_AVATAR_MAX_UPLOADS} ảnh tải lên. Xóa bớt để thêm ảnh mới.
        </span>
      )}
    </fieldset>
  );
}
