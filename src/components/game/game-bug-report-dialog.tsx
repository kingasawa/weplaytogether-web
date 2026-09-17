"use client";

import { Bug, CheckCircle2, ImageUp, LoaderCircle, Send, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useId, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { submitGameBugReport } from "@/app/games/report-actions";
import { modalBackdropVariants, modalPanelVariants } from "@/components/motion/modal-motion";
import {
  GAME_BUG_REPORT_IMAGE_MAX_COUNT,
  GAME_BUG_REPORT_IMAGE_SOURCE_MAX_BYTES,
  GAME_BUG_REPORT_IMAGE_UPLOAD_ACCEPT,
  GAME_BUG_REPORT_IMAGE_UPLOAD_MAX_BYTES,
} from "@/lib/game-bug-report-image-upload";
import { optimizeGameBugReportImage } from "@/lib/game-bug-report-image";
import styles from "./game-bug-report-dialog.module.css";

type GameBugReportDialogProps = {
  roomCode: string;
  gameId: string;
  disabled?: boolean;
};

const REPORT_TEXT_MIN_LENGTH = 5;
const REPORT_TEXT_MAX_LENGTH = 1000;
const IMAGE_UPLOAD_ENDPOINT = "/api/game-bug-report/image";

function getClientContext() {
  return {
    path: window.location.pathname,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    userAgent: window.navigator.userAgent,
  };
}

export default function GameBugReportDialog({
  roomCode,
  gameId,
  disabled = false,
}: GameBugReportDialogProps) {
  const titleId = useId();
  const textareaId = useId();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [error, setError] = useState("");
  const [hasSent, setHasSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageError, setImageError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [deletingImageUrl, setDeletingImageUrl] = useState<string | null>(null);

  const trimmedReportText = reportText.trim();
  const isReportTextValid =
    trimmedReportText.length >= REPORT_TEXT_MIN_LENGTH &&
    trimmedReportText.length <= REPORT_TEXT_MAX_LENGTH;
  const isDisabled = disabled || isPending || hasSent;
  const hasReachedImageLimit = imageUrls.length >= GAME_BUG_REPORT_IMAGE_MAX_COUNT;

  function openDialog() {
    setError("");
    setIsOpen(true);
  }

  // Xoá best-effort các ảnh vừa upload nhưng chưa gửi kèm report — tránh rác trong bucket khi
  // người chơi tải ảnh lên rồi đổi ý đóng dialog mà không bấm "Gửi report".
  function deleteUploadedImage(imageUrl: string) {
    fetch(IMAGE_UPLOAD_ENDPOINT, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    }).catch(() => {});
  }

  function closeDialog() {
    if (isPending || isUploadingImage) {
      return;
    }

    if (imageUrls.length > 0) {
      imageUrls.forEach(deleteUploadedImage);
      setImageUrls([]);
    }

    setError("");
    setImageError("");
    setIsOpen(false);
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    setImageError("");

    if (hasReachedImageLimit) {
      setImageError(`Tối đa ${GAME_BUG_REPORT_IMAGE_MAX_COUNT} ảnh.`);
      return;
    }

    if (file.size <= 0 || file.size > GAME_BUG_REPORT_IMAGE_SOURCE_MAX_BYTES) {
      setImageError("Ảnh gốc quá lớn (tối đa 15MB).");
      return;
    }

    setIsUploadingImage(true);

    try {
      const optimizedFile = await optimizeGameBugReportImage(file);

      if (optimizedFile.size > GAME_BUG_REPORT_IMAGE_UPLOAD_MAX_BYTES) {
        setImageError("Không thể nén ảnh đủ nhỏ. Hãy chọn ảnh khác.");
        return;
      }

      const formData = new FormData();
      formData.append("image", optimizedFile);
      formData.append("roomCode", roomCode);
      formData.append("gameId", gameId);

      let response: Response;

      try {
        response = await fetch(IMAGE_UPLOAD_ENDPOINT, { method: "POST", body: formData });
      } catch {
        setImageError("Không thể kết nối máy chủ. Vui lòng thử lại.");
        return;
      }

      const body = (await response.json().catch(() => null)) as { imageUrl?: string; error?: string } | null;

      if (!response.ok || !body?.imageUrl) {
        setImageError(body?.error ?? "Tải ảnh lên thất bại.");
        return;
      }

      setImageUrls((current) => [...current, body.imageUrl as string]);
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function removeImage(imageUrl: string) {
    setDeletingImageUrl(imageUrl);

    try {
      await fetch(IMAGE_UPLOAD_ENDPOINT, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      }).catch(() => {});
    } finally {
      setImageUrls((current) => current.filter((url) => url !== imageUrl));
      setDeletingImageUrl(null);
    }
  }

  function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isReportTextValid) {
      setError("Nội dung report cần từ 5 đến 1000 ký tự.");
      return;
    }

    setError("");

    startTransition(async () => {
      const result = await submitGameBugReport({
        roomCode,
        gameId,
        reportText: trimmedReportText,
        imageUrls,
        clientContext: getClientContext(),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setHasSent(true);
      setReportText("");
      setImageUrls([]);
      setIsOpen(false);
    });
  }

  return (
    <>
      <button
        className={`${styles.triggerButton} ${hasSent ? styles.triggerButtonSent : ""}`}
        type="button"
        disabled={isDisabled}
        onClick={openDialog}
      >
        {hasSent ? <CheckCircle2 aria-hidden="true" /> : <Bug aria-hidden="true" />}
        {hasSent ? "Đã gửi report" : "Báo lỗi"}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            animate="visible"
            className={styles.backdrop}
            exit="exit"
            initial="hidden"
            role="presentation"
            variants={modalBackdropVariants}
            onClick={closeDialog}
          >
          <motion.section
            animate="visible"
            aria-labelledby={titleId}
            aria-modal="true"
            className={styles.modal}
            exit="exit"
            initial="hidden"
            role="dialog"
            variants={modalPanelVariants}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Đóng báo lỗi"
              className={styles.closeButton}
              type="button"
              disabled={isPending || isUploadingImage}
              onClick={closeDialog}
            >
              <X aria-hidden="true" />
            </button>

            <h2 id={titleId}>Báo lỗi ván chơi</h2>
            <p>Ghi ngắn gọn lỗi bạn vừa gặp. Hệ thống sẽ tự lưu thông tin phòng và trạng thái ván để admin kiểm tra.</p>

            <form className={styles.form} onSubmit={submitReport}>
              <div className={styles.field}>
                <label htmlFor={textareaId}>Nội dung lỗi</label>
                <textarea
                  className={styles.textarea}
                  id={textareaId}
                  maxLength={REPORT_TEXT_MAX_LENGTH}
                  minLength={REPORT_TEXT_MIN_LENGTH}
                  placeholder="Mô tả lỗi bạn gặp trong ván này..."
                  value={reportText}
                  onChange={(event) => {
                    setReportText(event.target.value);
                    if (error) {
                      setError("");
                    }
                  }}
                />
                <div className={styles.metaRow}>
                  <span>Tối thiểu {REPORT_TEXT_MIN_LENGTH} ký tự</span>
                  <span>{trimmedReportText.length}/{REPORT_TEXT_MAX_LENGTH}</span>
                </div>
              </div>

              <div className={styles.field}>
                <label>Ảnh minh hoạ (không bắt buộc)</label>
                <div className={styles.imageGrid}>
                  {imageUrls.map((imageUrl) => (
                    <div className={styles.imageTile} key={imageUrl}>
                      <div className={styles.imageThumb}>
                        <Image alt="" fill sizes="88px" src={imageUrl} unoptimized />
                      </div>
                      <button
                        aria-label="Xóa ảnh"
                        className={styles.imageRemoveButton}
                        disabled={deletingImageUrl === imageUrl}
                        type="button"
                        onClick={() => removeImage(imageUrl)}
                      >
                        {deletingImageUrl === imageUrl ? (
                          <LoaderCircle aria-hidden="true" className={styles.spin} />
                        ) : (
                          <X aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  ))}

                  {!hasReachedImageLimit && (
                    <button
                      className={styles.imageAddButton}
                      disabled={isUploadingImage}
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      {isUploadingImage ? (
                        <LoaderCircle aria-hidden="true" className={styles.spin} />
                      ) : (
                        <ImageUp aria-hidden="true" />
                      )}
                      <span>Thêm ảnh</span>
                    </button>
                  )}
                </div>
                <input
                  accept={GAME_BUG_REPORT_IMAGE_UPLOAD_ACCEPT}
                  className={styles.hiddenFileInput}
                  ref={imageInputRef}
                  type="file"
                  onChange={uploadImage}
                />
                <div className={styles.metaRow}>
                  <span>Tối đa {GAME_BUG_REPORT_IMAGE_MAX_COUNT} ảnh</span>
                  <span>{imageUrls.length}/{GAME_BUG_REPORT_IMAGE_MAX_COUNT}</span>
                </div>
                {imageError && <p className={styles.errorText}>{imageError}</p>}
              </div>

              {error && <p className={styles.errorText}>{error}</p>}

              <div className={styles.actions}>
                <button
                  className={styles.cancelButton}
                  disabled={isPending || isUploadingImage}
                  type="button"
                  onClick={closeDialog}
                >
                  <X aria-hidden="true" />
                  Hủy
                </button>
                <button
                  className={styles.submitButton}
                  disabled={isPending || isUploadingImage || !isReportTextValid}
                  type="submit"
                >
                  {isPending ? <LoaderCircle aria-hidden="true" className={styles.spin} /> : <Send aria-hidden="true" />}
                  Gửi report
                </button>
              </div>
            </form>
          </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
