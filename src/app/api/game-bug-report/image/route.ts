import { cookies } from "next/headers";
import { deleteAvatarObject, listAvatarObjects, putAvatarObject } from "@/lib/avatar-storage";
import {
  GAME_BUG_REPORT_IMAGE_MAX_COUNT,
  GAME_BUG_REPORT_IMAGE_OBJECT_PREFIX,
  GAME_BUG_REPORT_IMAGE_UPLOAD_FIELD_NAME,
  GAME_BUG_REPORT_IMAGE_UPLOAD_MAX_BYTES,
  getGameBugReportImageExtension,
  getGameBugReportImageObjectKeyFromUrl,
  getGameBugReportImageObjectKeyPrefix,
  getGameBugReportImageUrl,
} from "@/lib/game-bug-report-image-upload";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { WOLF_PLAYER_SESSION_COOKIE } from "@/lib/wolf-session";

export const runtime = "nodejs";

const ROOM_CODE_PATTERN = /^[a-z]{4}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getPlayerSessionId() {
  const cookieStore = await cookies();
  return cookieStore.get(WOLF_PLAYER_SESSION_COOKIE)?.value ?? null;
}

// Xác nhận người gửi request thực sự là người chơi trong đúng phòng/ván đang report — cùng cách
// report-actions.ts xác thực trước khi ghi report, chỉ khác là không cần load toàn bộ game_context.
async function verifyReporterSession(roomCode: string, gameId: string, sessionId: string) {
  const supabase = createSupabaseAdminClient();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id")
    .eq("code", roomCode)
    .maybeSingle();

  if (roomError || !room) {
    return false;
  }

  const { data: game, error: gameError } = await supabase
    .from("game_sessions")
    .select("id")
    .eq("id", gameId)
    .eq("room_id", room.id)
    .maybeSingle();

  if (gameError || !game) {
    return false;
  }

  const { data: player, error: playerError } = await supabase
    .from("room_players")
    .select("id")
    .eq("room_id", room.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  return !playerError && Boolean(player);
}

export async function POST(request: Request) {
  const sessionId = await getPlayerSessionId();

  if (!sessionId) {
    return Response.json({ error: "Bạn không còn ở trong ván này." }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get(GAME_BUG_REPORT_IMAGE_UPLOAD_FIELD_NAME);
  const roomCode = typeof formData.get("roomCode") === "string" ? String(formData.get("roomCode")).trim().toLowerCase() : "";
  const gameId = typeof formData.get("gameId") === "string" ? String(formData.get("gameId")).trim() : "";

  if (!ROOM_CODE_PATTERN.test(roomCode) || !UUID_PATTERN.test(gameId)) {
    return Response.json({ error: "Thông tin ván không hợp lệ." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return Response.json({ error: "Thiếu file ảnh." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > GAME_BUG_REPORT_IMAGE_UPLOAD_MAX_BYTES) {
    return Response.json({ error: "Ảnh vượt quá 4MB sau khi nén. Hãy thử ảnh khác." }, { status: 400 });
  }

  const extension = getGameBugReportImageExtension(file.type);

  if (!extension) {
    return Response.json({ error: "Chỉ hỗ trợ ảnh PNG, JPG hoặc WebP." }, { status: 400 });
  }

  const isReporterInRoom = await verifyReporterSession(roomCode, gameId, sessionId);

  if (!isReporterInRoom) {
    return Response.json({ error: "Bạn không còn ở trong ván này." }, { status: 403 });
  }

  const objectKeyPrefix = getGameBugReportImageObjectKeyPrefix(sessionId, gameId);
  const existingImages = await listAvatarObjects(objectKeyPrefix);

  if (existingImages.length >= GAME_BUG_REPORT_IMAGE_MAX_COUNT) {
    return Response.json(
      { error: `Tối đa ${GAME_BUG_REPORT_IMAGE_MAX_COUNT} ảnh. Hãy xóa bớt trước khi tải thêm.` },
      { status: 400 }
    );
  }

  const objectKey = `${objectKeyPrefix}${crypto.randomUUID()}.${extension}`;
  const imageUrl = getGameBugReportImageUrl(objectKey);

  if (!imageUrl) {
    return Response.json({ error: "Chưa cấu hình public URL cho ảnh." }, { status: 503 });
  }

  try {
    await putAvatarObject(objectKey, file, file.type);
  } catch {
    return Response.json({ error: "Không thể tải ảnh lên. Vui lòng thử lại." }, { status: 503 });
  }

  return Response.json({ imageUrl });
}

export async function DELETE(request: Request) {
  const sessionId = await getPlayerSessionId();

  if (!sessionId) {
    return Response.json({ error: "Không tìm thấy phiên người chơi." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { imageUrl?: string } | null;
  const imageUrl = body?.imageUrl?.trim();

  if (!imageUrl) {
    return Response.json({ error: "Thiếu imageUrl." }, { status: 400 });
  }

  const objectKey = getGameBugReportImageObjectKeyFromUrl(imageUrl);

  if (!objectKey?.startsWith(`${GAME_BUG_REPORT_IMAGE_OBJECT_PREFIX}${sessionId}/`)) {
    return Response.json({ error: "Không có quyền xóa ảnh này." }, { status: 403 });
  }

  try {
    await deleteAvatarObject(objectKey);
  } catch {
    return Response.json({ error: "Không thể xóa ảnh. Vui lòng thử lại." }, { status: 503 });
  }

  return Response.json({ ok: true });
}
