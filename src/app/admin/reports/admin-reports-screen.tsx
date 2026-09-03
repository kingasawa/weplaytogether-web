"use client";

import { Bug, Eye, LoaderCircle, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  GAME_BUG_REPORT_GAME_LABELS,
  GAME_BUG_REPORT_STATUS_LABELS,
  listGameBugReports,
  updateGameBugReportNote,
  updateGameBugReportStatus,
  type GameBugReportFilters,
} from "@/lib/admin-reports";
import type { GameBugReportGameKey, GameBugReportRow, GameBugReportStatus, Json } from "@/lib/supabase/types";
import styles from "../admin.module.css";

const STATUS_OPTIONS: Array<GameBugReportStatus | "all"> = [
  "all",
  "open",
  "investigating",
  "fixed",
  "duplicate",
  "wont_fix",
];

const GAME_OPTIONS: Array<GameBugReportGameKey | "all"> = ["all", "wolf", "classic_wolf", "avalon"];

function formatDateTime(iso: string | null) {
  if (!iso) {
    return "—";
  }

  try {
    return new Date(iso).toLocaleString("vi-VN");
  } catch {
    return iso;
  }
}

function truncateText(text: string, maxLength: number) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function stringifyJson(value: Json) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getStatusBadgeClassName(status: GameBugReportStatus) {
  if (status === "open") {
    return styles.badgeOpen;
  }

  if (status === "investigating") {
    return styles.badgeInvestigating;
  }

  if (status === "fixed") {
    return styles.badgeFixed;
  }

  if (status === "duplicate") {
    return styles.badgeDuplicate;
  }

  return styles.badgeWontFix;
}

export default function AdminReportsScreen() {
  const [reports, setReports] = useState<GameBugReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<GameBugReportFilters>({
    status: "all",
    gameKey: "all",
    search: "",
    fromDate: "",
    toDate: "",
  });
  const [selectedReport, setSelectedReport] = useState<GameBugReportRow | null>(null);
  const [draftStatus, setDraftStatus] = useState<GameBugReportStatus>("open");
  const [draftNote, setDraftNote] = useState("");
  const [detailError, setDetailError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      const { data, error } = await listGameBugReports(filters);

      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (error) {
        setLoadError(error);
        setReports([]);
        return;
      }

      setLoadError("");
      setReports(data ?? []);
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [filters]);

  function openDetail(report: GameBugReportRow) {
    setSelectedReport(report);
    setDraftStatus(report.status);
    setDraftNote(report.admin_note ?? "");
    setDetailError("");
  }

  function closeDetail() {
    if (isSaving) {
      return;
    }

    setSelectedReport(null);
    setDetailError("");
  }

  async function saveDetail() {
    if (!selectedReport) {
      return;
    }

    setIsSaving(true);
    setDetailError("");

    let nextReport = selectedReport;

    if (draftStatus !== selectedReport.status) {
      const { data, error } = await updateGameBugReportStatus(selectedReport.id, draftStatus);

      if (error || !data) {
        setDetailError(error ?? "Không thể cập nhật trạng thái.");
        setIsSaving(false);
        return;
      }

      nextReport = data;
    }

    if (draftNote.trim() !== (nextReport.admin_note ?? "")) {
      const { data, error } = await updateGameBugReportNote(selectedReport.id, draftNote);

      if (error || !data) {
        setDetailError(error ?? "Không thể lưu ghi chú.");
        setIsSaving(false);
        return;
      }

      nextReport = data;
    }

    setReports((current) => current.map((report) => (report.id === nextReport.id ? nextReport : report)));
    setSelectedReport(nextReport);
    setDraftStatus(nextReport.status);
    setDraftNote(nextReport.admin_note ?? "");
    setIsSaving(false);
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1>Report lỗi</h1>
          <p>Xem lỗi người chơi gửi sau ván và lưu trạng thái xử lý.</p>
        </div>
      </div>

      <div className={styles.reportFilters}>
        <div className={styles.reportFilterField}>
          <label htmlFor="report-status-filter">Trạng thái</label>
          <select
            id="report-status-filter"
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value as GameBugReportStatus | "all" }))
            }
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "Tất cả" : GAME_BUG_REPORT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.reportFilterField}>
          <label htmlFor="report-game-filter">Game</label>
          <select
            id="report-game-filter"
            value={filters.gameKey}
            onChange={(event) =>
              setFilters((current) => ({ ...current, gameKey: event.target.value as GameBugReportGameKey | "all" }))
            }
          >
            {GAME_OPTIONS.map((gameKey) => (
              <option key={gameKey} value={gameKey}>
                {gameKey === "all" ? "Tất cả" : GAME_BUG_REPORT_GAME_LABELS[gameKey]}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.reportFilterField}>
          <label htmlFor="report-search-filter">Tìm kiếm</label>
          <input
            id="report-search-filter"
            placeholder="Room, tên, nội dung..."
            type="search"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </div>

        <div className={styles.reportFilterField}>
          <label htmlFor="report-from-filter">Từ ngày</label>
          <input
            id="report-from-filter"
            type="date"
            value={filters.fromDate}
            onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))}
          />
        </div>

        <div className={styles.reportFilterField}>
          <label htmlFor="report-to-filter">Đến ngày</label>
          <input
            id="report-to-filter"
            type="date"
            value={filters.toDate}
            onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))}
          />
        </div>
      </div>

      {loadError && <p className={styles.errorText}>{loadError}</p>}

      {isLoading ? (
        <div className={styles.loadingRow}>
          <LoaderCircle aria-hidden="true" />
          Đang tải report...
        </div>
      ) : reports.length === 0 && !loadError ? (
        <div className={styles.tableWrapper}>
          <div className={styles.emptyState}>
            <Bug aria-hidden="true" />
            <p>Chưa có report nào phù hợp bộ lọc.</p>
          </div>
        </div>
      ) : (
        !loadError && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Trạng thái</th>
                  <th>Game</th>
                  <th>Room</th>
                  <th>Người report</th>
                  <th>Nội dung</th>
                  <th>Thời gian</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <span className={`${styles.badge} ${getStatusBadgeClassName(report.status)}`}>
                        {GAME_BUG_REPORT_STATUS_LABELS[report.status]}
                      </span>
                    </td>
                    <td>{GAME_BUG_REPORT_GAME_LABELS[report.game_key]}</td>
                    <td>{report.room_code.toUpperCase()}</td>
                    <td>{report.reporter_name}</td>
                    <td className={styles.reportTextCell}>{truncateText(report.report_text, 120)}</td>
                    <td>{formatDateTime(report.created_at)}</td>
                    <td>
                      <button
                        className={styles.iconOnlyButton}
                        type="button"
                        aria-label={`Xem report ${report.room_code.toUpperCase()}`}
                        onClick={() => openDetail(report)}
                      >
                        <Eye aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {selectedReport && (
        <div className={styles.formBackdrop} role="presentation" onClick={closeDetail}>
          <section
            aria-labelledby="admin-report-detail-title"
            aria-modal="true"
            className={`${styles.formModal} ${styles.reportModal}`}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="admin-report-detail-title">Report {selectedReport.room_code.toUpperCase()}</h2>

            <dl className={styles.reportDetailGrid}>
              <div>
                <dt>Game</dt>
                <dd>{GAME_BUG_REPORT_GAME_LABELS[selectedReport.game_key]}</dd>
              </div>
              <div>
                <dt>Người report</dt>
                <dd>{selectedReport.reporter_name}</dd>
              </div>
              <div>
                <dt>Game ID</dt>
                <dd>{selectedReport.game_id}</dd>
              </div>
              <div>
                <dt>Room ID</dt>
                <dd>{selectedReport.room_id}</dd>
              </div>
              <div>
                <dt>Phase</dt>
                <dd>{selectedReport.game_phase}</dd>
              </div>
              <div>
                <dt>Gửi lúc</dt>
                <dd>{formatDateTime(selectedReport.created_at)}</dd>
              </div>
            </dl>

            <h3 className={styles.reportSectionTitle}>Nội dung report</h3>
            <p className={styles.reportTextBlock}>{selectedReport.report_text}</p>

            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label htmlFor="report-detail-status">Trạng thái</label>
                <select
                  id="report-detail-status"
                  value={draftStatus}
                  onChange={(event) => setDraftStatus(event.target.value as GameBugReportStatus)}
                >
                  {STATUS_OPTIONS.filter((status): status is GameBugReportStatus => status !== "all").map((status) => (
                    <option key={status} value={status}>
                      {GAME_BUG_REPORT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="report-detail-note">Ghi chú admin</label>
                <textarea
                  id="report-detail-note"
                  value={draftNote}
                  onChange={(event) => setDraftNote(event.target.value)}
                />
              </div>
            </div>

            {detailError && <p className={styles.errorText}>{detailError}</p>}

            <details className={styles.reportJsonDetails}>
              <summary>Game context</summary>
              <pre className={styles.jsonBlock}>{stringifyJson(selectedReport.game_context)}</pre>
            </details>

            <details className={styles.reportJsonDetails}>
              <summary>Client context</summary>
              <pre className={styles.jsonBlock}>{stringifyJson(selectedReport.client_context)}</pre>
            </details>

            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" disabled={isSaving} onClick={closeDetail}>
                <X aria-hidden="true" />
                Đóng
              </button>
              <button className={styles.primaryButton} type="button" disabled={isSaving} onClick={saveDetail}>
                {isSaving ? <LoaderCircle aria-hidden="true" /> : <Save aria-hidden="true" />}
                Lưu thay đổi
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
