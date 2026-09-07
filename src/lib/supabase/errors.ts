type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null | undefined;

function isMissingColumnError(error: SupabaseErrorLike, columnName: string) {
  if (!error) {
    return false;
  }

  const errorText = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${
    error.hint ?? ""
  }`.toLowerCase();

  if (!errorText.includes(columnName)) {
    return false;
  }

  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
      (errorText.includes("column") &&
        (errorText.includes("does not exist") || errorText.includes("could not find")))
  );
}

export function isMissingAvatarKeyColumnError(error: SupabaseErrorLike) {
  return isMissingColumnError(error, "avatar_key");
}

export function isMissingAvatarObjectKeyColumnError(error: SupabaseErrorLike) {
  return isMissingColumnError(error, "avatar_object_key");
}

export function isMissingUserIdColumnError(error: SupabaseErrorLike) {
  return isMissingColumnError(error, "user_id");
}

export function isMissingFrameColorColumnError(error: SupabaseErrorLike) {
  return isMissingColumnError(error, "frame_color");
}

// Request bị chặn TRƯỚC KHI tới được Supabase (thường do tiện ích chặn quảng cáo/quyền riêng
// tư trên trình duyệt chặn/xoá header của request tới *.supabase.co, hoặc do lỗi mạng thật sự).
// postgrest-js bọc mọi lỗi fetch() (không phải lỗi Postgres/PostgREST) thành error.code rỗng +
// message dạng "TypeError: Failed to fetch" — khác hẳn lỗi RLS/trigger thật (luôn có code khác
// rỗng, ví dụ "42501", "P0001"). Phân biệt được để hiện gợi ý đúng thay vì thông báo chung chung.
export function isNetworkBlockedError(error: SupabaseErrorLike) {
  if (!error) {
    return false;
  }

  if (error.code) {
    return false;
  }

  const message = (error.message ?? "").toLowerCase();

  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("fetcherror")
  );
}

// PGRST205: bảng chưa tồn tại trên remote (migration chưa được apply thủ công).
export function isMissingTableError(error: SupabaseErrorLike, tableName: string) {
  if (!error) {
    return false;
  }

  const errorText = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${
    error.hint ?? ""
  }`.toLowerCase();

  if (!errorText.includes(tableName.toLowerCase())) {
    return false;
  }

  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    (errorText.includes("relation") && errorText.includes("does not exist"))
  );
}
