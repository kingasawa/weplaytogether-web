import { cookies } from "next/headers";
import { deleteAvatarObject, putAvatarObject } from "@/lib/avatar-storage";
import {
  getUploadedPlayerAvatarUrl,
  normalizeUploadedPlayerAvatarObjectKey,
  PLAYER_AVATAR_OBJECT_PREFIX,
} from "@/lib/player-avatars";
import {
  getPlayerAvatarUploadExtension,
  PLAYER_AVATAR_UPLOAD_FIELD_NAME,
  PLAYER_AVATAR_UPLOAD_MAX_BYTES,
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
    return Response.json({ error: "Chưa cấu hình public URL cho avatar." }, { status: 503 });
  }

  try {
    await putAvatarObject(objectKey, avatarFile, avatarFile.type);
  } catch {
    return Response.json({ error: "Không thể tải avatar lên." }, { status: 503 });
  }

  // Giữ lại các avatar đã upload trước đó để hiển thị chung trong bộ sưu tập của user.
  return Response.json({
    avatarUrl,
    objectKey,
  });
}

export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(WOLF_PLAYER_SESSION_COOKIE)?.value;

  if (!sessionId) {
    return Response.json({ error: "Không tìm thấy phiên người chơi." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { objectKey?: unknown } | null;
  const objectKey = normalizeUploadedPlayerAvatarObjectKey(
    typeof body?.objectKey === "string" ? body.objectKey : null
  );

  if (!objectKey) {
    return Response.json({ error: "Object key không hợp lệ." }, { status: 400 });
  }

  if (!isAvatarObjectKeyOwnedBySession(objectKey, sessionId)) {
    return Response.json({ error: "Không có quyền xóa avatar này." }, { status: 403 });
  }

  try {
    await deleteAvatarObject(objectKey);
  } catch {
    return Response.json({ error: "Không thể xóa avatar." }, { status: 503 });
  }

  return Response.json({ ok: true });
}
