import { cookies } from "next/headers";
import { deleteAvatarObject, putAvatarObject } from "@/lib/cloudflare-r2";
import {
  getUploadedPlayerAvatarUrl,
  normalizePlayerAvatarObjectKey,
  PLAYER_AVATAR_OBJECT_PREFIX,
} from "@/lib/player-avatars";
import {
  getPlayerAvatarUploadExtension,
  PLAYER_AVATAR_UPLOAD_FIELD_NAME,
  PLAYER_AVATAR_UPLOAD_MAX_BYTES,
  PREVIOUS_PLAYER_AVATAR_OBJECT_KEY_FIELD_NAME,
} from "@/lib/player-avatar-upload";
import { WOLF_PLAYER_SESSION_COOKIE } from "@/lib/wolf-session";

export const runtime = "nodejs";

async function getOrCreatePlayerSessionId() {
  const cookieStore = await cookies();
  const existingSessionId = cookieStore.get(WOLF_PLAYER_SESSION_COOKIE)?.value;

  if (existingSessionId) {
    return existingSessionId;
  }

  const sessionId = crypto.randomUUID();
  cookieStore.set(WOLF_PLAYER_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return sessionId;
}

function isAvatarObjectKeyOwnedBySession(avatarObjectKey: string | null, sessionId: string) {
  return Boolean(avatarObjectKey?.startsWith(`${PLAYER_AVATAR_OBJECT_PREFIX}${sessionId}/`));
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const avatarFile = formData.get(PLAYER_AVATAR_UPLOAD_FIELD_NAME);

  if (!(avatarFile instanceof File)) {
    return Response.json({ error: "Vui lòng chọn ảnh avatar hợp lệ." }, { status: 400 });
  }

  if (avatarFile.size <= 0 || avatarFile.size > PLAYER_AVATAR_UPLOAD_MAX_BYTES) {
    return Response.json({ error: "Ảnh avatar phải nhỏ hơn 2MB." }, { status: 400 });
  }

  const fileExtension = getPlayerAvatarUploadExtension(avatarFile.type);

  if (!fileExtension) {
    return Response.json({ error: "Chỉ hỗ trợ ảnh PNG, JPG hoặc WebP." }, { status: 400 });
  }

  const sessionId = await getOrCreatePlayerSessionId();
  const objectKey = `${PLAYER_AVATAR_OBJECT_PREFIX}${sessionId}/${crypto.randomUUID()}.${fileExtension}`;
  const avatarUrl = getUploadedPlayerAvatarUrl(objectKey);

  if (!avatarUrl) {
    return Response.json({ error: "Chưa cấu hình public URL cho R2 avatar." }, { status: 503 });
  }

  try {
    await putAvatarObject(objectKey, avatarFile, avatarFile.type);
  } catch {
    return Response.json({ error: "Không thể tải avatar lên R2." }, { status: 503 });
  }

  const previousAvatarObjectKey = normalizePlayerAvatarObjectKey(
    String(formData.get(PREVIOUS_PLAYER_AVATAR_OBJECT_KEY_FIELD_NAME) ?? "")
  );

  if (
    previousAvatarObjectKey &&
    previousAvatarObjectKey !== objectKey &&
    isAvatarObjectKeyOwnedBySession(previousAvatarObjectKey, sessionId)
  ) {
    try {
      await deleteAvatarObject(previousAvatarObjectKey);
    } catch {
      // A stale avatar object should not block the newly uploaded avatar.
    }
  }

  return Response.json({
    avatarUrl,
    objectKey,
  });
}
