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
