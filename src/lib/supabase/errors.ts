type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null | undefined;

export function isMissingAvatarKeyColumnError(error: SupabaseErrorLike) {
  if (!error) {
    return false;
  }

  const errorText = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${
    error.hint ?? ""
  }`.toLowerCase();

  if (!errorText.includes("avatar_key")) {
    return false;
  }

  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (errorText.includes("column") &&
      (errorText.includes("does not exist") || errorText.includes("could not find")))
  );
}
