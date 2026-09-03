"use client";

import { Bug, CheckCircle2, LoaderCircle, Send, X } from "lucide-react";
import { useId, useState, useTransition, type FormEvent } from "react";
import { submitGameBugReport } from "@/app/games/report-actions";
import styles from "./game-bug-report-dialog.module.css";

type GameBugReportDialogProps = {
  roomCode: string;
  gameId: string;
  disabled?: boolean;
};

const REPORT_TEXT_MIN_LENGTH = 5;
const REPORT_TEXT_MAX_LENGTH = 1000;

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
  const [isOpen, setIsOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [error, setError] = useState("");
  const [hasSent, setHasSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const trimmedReportText = reportText.trim();
  const isReportTextValid =
    trimmedReportText.length >= REPORT_TEXT_MIN_LENGTH &&
    trimmedReportText.length <= REPORT_TEXT_MAX_LENGTH;
  const isDisabled = disabled || isPending || hasSent;

  function openDialog() {
    setError("");
    setIsOpen(true);
  }

  function closeDialog() {
    if (isPending) {
      return;
    }

    setError("");
    setIsOpen(false);
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
        clientContext: getClientContext(),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setHasSent(true);
      setReportText("");
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

      {isOpen && (
        <div className={styles.backdrop} role="presentation" onClick={closeDialog}>
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className={styles.modal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Đóng báo lỗi"
              className={styles.closeButton}
              type="button"
              disabled={isPending}
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

              {error && <p className={styles.errorText}>{error}</p>}

              <div className={styles.actions}>
                <button className={styles.cancelButton} type="button" disabled={isPending} onClick={closeDialog}>
                  <X aria-hidden="true" />
                  Hủy
                </button>
                <button className={styles.submitButton} type="submit" disabled={isPending || !isReportTextValid}>
                  {isPending ? <LoaderCircle aria-hidden="true" className={styles.spin} /> : <Send aria-hidden="true" />}
                  Gửi report
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
