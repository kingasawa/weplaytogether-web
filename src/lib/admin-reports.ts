import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isMissingTableError } from "@/lib/supabase/errors";
import type { GameBugReportGameKey, GameBugReportRow, GameBugReportStatus } from "@/lib/supabase/types";

export type AdminResult<T> = { data: T; error: null } | { data: null; error: string };

export type GameBugReportFilters = {
  status?: GameBugReportStatus | "all";
  gameKey?: GameBugReportGameKey | "all";
  search?: string;
  fromDate?: string;
  toDate?: string;
};

export const GAME_BUG_REPORT_STATUS_LABELS: Record<GameBugReportStatus, string> = {
  open: "Mới",
  investigating: "Đang xử lý",
  fixed: "Đã sửa",
  duplicate: "Trùng",
  wont_fix: "Không sửa",
};

export const GAME_BUG_REPORT_GAME_LABELS: Record<GameBugReportGameKey, string> = {
  wolf: "Ma Sói Một Đêm",
  classic_wolf: "Ma Sói Nhiều Đêm",
  avalon: "Avalon",
};

const GAME_BUG_REPORT_COLUMNS =
  "id, reporter_user_id, reporter_player_id, reporter_name, game_key, game_id, room_id, room_code, game_phase, report_text, game_context, client_context, status, admin_note, resolved_at, created_at, updated_at";
const NOT_READY_ERROR = "Dữ liệu report chưa được khởi tạo trên Supabase. Hãy chạy migration trước.";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function client() {
  return createSupabaseBrowserClient() as unknown as SupabaseClient;
}

function isGameBugReportStatus(value: unknown): value is GameBugReportStatus {
  return (
    value === "open" ||
    value === "investigating" ||
    value === "fixed" ||
    value === "duplicate" ||
    value === "wont_fix"
  );
}

function getNextDateIso(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export async function listGameBugReports(filters: GameBugReportFilters = {}): Promise<AdminResult<GameBugReportRow[]>> {
  let query = client()
    .from("game_bug_reports")
    .select(GAME_BUG_REPORT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.gameKey && filters.gameKey !== "all") {
    query = query.eq("game_key", filters.gameKey);
  }

  if (filters.fromDate) {
    query = query.gte("created_at", new Date(`${filters.fromDate}T00:00:00`).toISOString());
  }

  if (filters.toDate) {
    const nextDateIso = getNextDateIso(filters.toDate);
    if (nextDateIso) {
      query = query.lt("created_at", nextDateIso);
    }
  }

  const normalizedSearch = filters.search?.trim().replace(/[,()%_]/g, "") ?? "";

  if (normalizedSearch) {
    const clauses = [
      `room_code.ilike.%${normalizedSearch}%`,
      `reporter_name.ilike.%${normalizedSearch}%`,
      `report_text.ilike.%${normalizedSearch}%`,
    ];

    if (UUID_PATTERN.test(normalizedSearch)) {
      clauses.push(`reporter_user_id.eq.${normalizedSearch}`);
    }

    query = query.or(clauses.join(","));
  }

  const { data, error } = await query;

  if (error) {
    return {
      data: null,
      error: isMissingTableError(error, "game_bug_reports") ? NOT_READY_ERROR : error.message,
    };
  }

  return { data: (data ?? []) as GameBugReportRow[], error: null };
}

export async function updateGameBugReportStatus(
  reportId: string,
  status: GameBugReportStatus
): Promise<AdminResult<GameBugReportRow>> {
  if (!UUID_PATTERN.test(reportId) || !isGameBugReportStatus(status)) {
    return { data: null, error: "Thông tin report không hợp lệ." };
  }

  const { data, error } = await client()
    .from("game_bug_reports")
    .update({ status })
    .eq("id", reportId)
    .select(GAME_BUG_REPORT_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: isMissingTableError(error, "game_bug_reports") ? NOT_READY_ERROR : error.message,
    };
  }

  return { data: data as GameBugReportRow, error: null };
}

export async function updateGameBugReportNote(
  reportId: string,
  note: string
): Promise<AdminResult<GameBugReportRow>> {
  if (!UUID_PATTERN.test(reportId)) {
    return { data: null, error: "Thông tin report không hợp lệ." };
  }

  const { data, error } = await client()
    .from("game_bug_reports")
    .update({ admin_note: note.trim() || null })
    .eq("id", reportId)
    .select(GAME_BUG_REPORT_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: isMissingTableError(error, "game_bug_reports") ? NOT_READY_ERROR : error.message,
    };
  }

  return { data: data as GameBugReportRow, error: null };
}
