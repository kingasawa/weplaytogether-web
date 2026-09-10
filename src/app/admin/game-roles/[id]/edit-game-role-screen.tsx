"use client";

import { AlertTriangle, ArrowLeft, ImageOff, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import {
  deleteGameRoleGalleryImage,
  getGameRoleById,
  listGameRoleGallery,
  updateGameRole,
  uploadGameRoleGalleryImage,
  type GameRoleGalleryImage,
} from "@/lib/admin-game-roles";
import { GAME_ROLE_KEY_LABELS, type GameRoleRow } from "@/lib/game-roles";
import { GAME_ROLE_IMAGE_ACCEPT } from "@/lib/game-role-image";
import styles from "../../admin.module.css";

// Route /admin/game-roles/[id] chỉ nhận id qua URL nên tự fetch lại đúng row khi mount, giống
// hệt EditItemScreen (/admin/items/[id]) — chỉ 3 nội dung sửa được: ảnh, tên VI, tên EN. role_key
// và game đều cố định theo code (không cho đổi), nên không có nút "Thêm role mới" ở đây.
export default function EditGameRoleScreen({ roleId }: { roleId: string }) {
  const router = useRouter();
  const [role, setRole] = useState<GameRoleRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [displayNameVi, setDisplayNameVi] = useState("");
  const [displayNameEn, setDisplayNameEn] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [gallery, setGallery] = useState<GameRoleGalleryImage[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState("");
  const [isUploadingToGallery, setIsUploadingToGallery] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      const result = await getGameRoleById(roleId);

      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? "Không tìm thấy role.");
        return;
      }

      setRole(result.data);
      setDisplayNameVi(result.data.displayNameVi);
      setDisplayNameEn(result.data.displayNameEn);
      setImageUrl(result.data.imageUrl);
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [roleId]);

  async function loadGallery() {
    if (!role) {
      return;
    }

    setIsGalleryLoading(true);
    setGalleryError("");
    const result = await listGameRoleGallery(role.gameKey);
    setIsGalleryLoading(false);

    if (result.error) {
      setGalleryError(result.error);
      return;
    }

    setGallery(result.data ?? []);
  }

  function openGallery() {
    setIsGalleryOpen(true);
    void loadGallery();
  }

  function selectGalleryImage(url: string) {
    setImageUrl(url);
    setIsGalleryOpen(false);
  }

  async function handleUploadToGallery(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !role) {
      return;
    }

    setIsUploadingToGallery(true);
    setGalleryError("");
    const result = await uploadGameRoleGalleryImage(role.gameKey, file);
    setIsUploadingToGallery(false);

    if (result.error || !result.data) {
      setGalleryError(result.error ?? "Tải ảnh lên thất bại.");
      return;
    }

    setGallery((current) => [result.data as GameRoleGalleryImage, ...current]);
  }

  async function handleDeleteGalleryImage(event: MouseEvent<HTMLButtonElement>, image: GameRoleGalleryImage) {
    event.stopPropagation();

    if (!window.confirm("Xoá ảnh này khỏi gallery? Hành động này không thể hoàn tác.")) {
      return;
    }

    setDeletingKey(image.key);
    setGalleryError("");
    const result = await deleteGameRoleGalleryImage(image.key, image.url);
    setDeletingKey(null);

    if (!result.ok) {
      if (result.usedBy?.length) {
        const usageText = result.usedBy
          .map((usage) => `${usage.displayNameVi} (${GAME_ROLE_KEY_LABELS[usage.gameKey]})`)
          .join(", ");
        setGalleryError(`Ảnh đang được dùng cho role: ${usageText}. Không thể xoá.`);
      } else {
        setGalleryError(result.error);
      }
      return;
    }

    setGallery((current) => current.filter((entry) => entry.key !== image.key));
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedVi = displayNameVi.trim();
    const trimmedEn = displayNameEn.trim();
    const trimmedImageUrl = imageUrl.trim();

    if (!trimmedVi || !trimmedEn) {
      setFormError("Vui lòng nhập tên hiển thị cho cả 2 ngôn ngữ.");
      return;
    }

    if (!trimmedImageUrl) {
      setFormError("Vui lòng chọn ảnh cho role.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    const result = await updateGameRole(roleId, {
      displayNameVi: trimmedVi,
      displayNameEn: trimmedEn,
      imageUrl: trimmedImageUrl,
    });
    setIsSaving(false);

    if (result.error) {
      setFormError(result.error);
      return;
    }

    router.push("/admin/game-roles");
  }

  if (isLoading) {
    return (
      <div className={styles.loadingRow}>
        <LoaderCircle aria-hidden="true" />
        Đang tải role...
      </div>
    );
  }

  if (loadError || !role) {
    return (
      <div className={styles.tableWrapper}>
        <div className={styles.emptyState}>
          <AlertTriangle aria-hidden="true" />
          <p>{loadError || "Không tìm thấy role."}</p>
          <Link className={styles.secondaryButton} href="/admin/game-roles">
            <ArrowLeft aria-hidden="true" />
            Về danh sách role
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <Link className={styles.iconOnlyButton} aria-label="Quay lại danh sách" href="/admin/game-roles">
            <ArrowLeft aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className={styles.formScreenCard}>
        <h1 className={styles.formScreenTitle}>
          Sửa role: {role.roleKey} — {GAME_ROLE_KEY_LABELS[role.gameKey]}
        </h1>

        <form className={styles.formGrid} onSubmit={submitForm}>
          <div className={styles.formLayout}>
            <div className={styles.formLayoutPreview}>
              <div className={styles.formField}>
                <label>Ảnh</label>
                <div className={styles.galleryPreviewBox}>
                  {imageUrl ? (
                    <Image alt="" fill sizes="18rem" src={imageUrl} unoptimized />
                  ) : (
                    <ImageOff aria-hidden="true" />
                  )}
                </div>
                <button className={styles.secondaryButton} type="button" onClick={openGallery}>
                  <Upload aria-hidden="true" />
                  Chọn ảnh từ gallery
                </button>
              </div>
            </div>

            <div className={styles.formLayoutFields}>
              <div className={`${styles.formField} ${styles.formFieldWide}`}>
                <label htmlFor="role-name-vi">Tên hiển thị (Tiếng Việt)</label>
                <input
                  id="role-name-vi"
                  maxLength={60}
                  type="text"
                  value={displayNameVi}
                  onChange={(event) => setDisplayNameVi(event.target.value)}
                />
              </div>

              <div className={`${styles.formField} ${styles.formFieldWide}`}>
                <label htmlFor="role-name-en">Tên hiển thị (Tiếng Anh)</label>
                <input
                  id="role-name-en"
                  maxLength={60}
                  type="text"
                  value={displayNameEn}
                  onChange={(event) => setDisplayNameEn(event.target.value)}
                />
              </div>
            </div>
          </div>

          {formError && <p className={styles.errorText}>{formError}</p>}

          <div className={styles.formActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => router.push("/admin/game-roles")}>
              <X aria-hidden="true" />
              Hủy
            </button>
            <button className={styles.primaryButton} type="submit" disabled={isSaving}>
              {isSaving && <LoaderCircle aria-hidden="true" />}
              Lưu thay đổi
            </button>
          </div>
        </form>
      </div>

      {isGalleryOpen && (
        <div className={styles.formBackdrop} role="presentation" onClick={() => setIsGalleryOpen(false)}>
          <section
            aria-labelledby="gallery-modal-title"
            aria-modal="true"
            className={styles.galleryModal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.galleryModalHeader}>
              <h2 id="gallery-modal-title">Gallery ảnh — {GAME_ROLE_KEY_LABELS[role.gameKey]}</h2>
              <button
                className={styles.iconOnlyButton}
                type="button"
                aria-label="Đóng gallery"
                onClick={() => setIsGalleryOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <input
              ref={fileInputRef}
              accept={GAME_ROLE_IMAGE_ACCEPT}
              className={styles.hiddenFileInput}
              type="file"
              onChange={handleUploadToGallery}
            />
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={isUploadingToGallery}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploadingToGallery ? <LoaderCircle aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {isUploadingToGallery ? "Đang tải lên..." : "Tải ảnh mới vào gallery"}
            </button>

            {galleryError && <p className={styles.errorText}>{galleryError}</p>}

            {isGalleryLoading ? (
              <div className={styles.loadingRow}>
                <LoaderCircle aria-hidden="true" />
                Đang tải gallery...
              </div>
            ) : gallery.length === 0 ? (
              <div className={styles.emptyState}>
                <ImageOff aria-hidden="true" />
                <p>Chưa có ảnh nào trong gallery của game này.</p>
              </div>
            ) : (
              <div className={styles.galleryGrid}>
                {gallery.map((image) => (
                  <div
                    className={`${styles.galleryTile} ${image.url === imageUrl ? styles.galleryTileActive : ""}`}
                    key={image.key}
                  >
                    <button
                      className={styles.galleryTileSelect}
                      type="button"
                      aria-label="Chọn ảnh này"
                      onClick={() => selectGalleryImage(image.url)}
                    >
                      <Image alt="" fill sizes="8rem" src={image.url} unoptimized />
                    </button>
                    <button
                      className={`${styles.iconOnlyButton} ${styles.danger} ${styles.galleryTileDelete}`}
                      type="button"
                      aria-label="Xoá ảnh này khỏi gallery"
                      disabled={deletingKey === image.key}
                      onClick={(event) => void handleDeleteGalleryImage(event, image)}
                    >
                      {deletingKey === image.key ? (
                        <LoaderCircle aria-hidden="true" />
                      ) : (
                        <Trash2 aria-hidden="true" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
