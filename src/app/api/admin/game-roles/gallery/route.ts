import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";
import { deleteAvatarObject, listAvatarObjects, putAvatarObject } from "@/lib/avatar-storage";

export const runtime = "nodejs";

// Gallery ảnh role theo game, lưu ở GCS bucket weplaytogether-uploads dưới prefix
// "roles/<gameKey>/" — dùng cho /admin/game-roles/[id] (chọn ảnh có sẵn hoặc upload thêm ảnh mới
// vào gallery). Object key upload mới LUÔN random (KHÔNG trùng role_key) để mỗi lần upload là 1
// URL mới — tránh vướng Cache-Control: immutable 1 năm khi cần đổi ảnh sau này (xem
// scripts/upload-role-images.mjs).
const GAME_KEYS = new Set(["wolf", "classic_wolf", "avalon"]);
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const ALLOWED_EXTENSION_BY_TYPE = new Map([
  ["image/webp", "webp"],
  ["image/png", "png"],
]);

async function getRequestAdminEmail(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.trim() ?? null;

  if (error || !isAdminEmail(email)) {
    return null;
  }

  return email;
}

function getPublicBaseUrl() {
  return process.env.NEXT_PUBLIC_AVATAR_PUBLIC_URL?.trim().replace(/\/+$/, "") ?? null;
}

function objectKeyToUrl(publicBaseUrl: string, key: string) {
  return `${publicBaseUrl}/${key.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

export async function GET(request: Request) {
  const adminEmail = await getRequestAdminEmail(request);

  if (!adminEmail) {
    return Response.json({ error: "Không có quyền quản trị." }, { status: 403 });
  }

  const gameKey = new URL(request.url).searchParams.get("gameKey") ?? "";

  if (!GAME_KEYS.has(gameKey)) {
    return Response.json({ error: "gameKey không hợp lệ." }, { status: 400 });
  }

  const publicBaseUrl = getPublicBaseUrl();

  if (!publicBaseUrl) {
    return Response.json({ error: "Chưa cấu hình public URL cho ảnh." }, { status: 503 });
  }

  try {
    const objects = await listAvatarObjects(`roles/${gameKey}/`);

    return Response.json({
      images: objects.map((object) => ({
        key: object.key,
        url: objectKeyToUrl(publicBaseUrl, object.key),
        updatedAt: object.updatedAt,
      })),
    });
  } catch {
    return Response.json({ error: "Không thể tải gallery ảnh." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const adminEmail = await getRequestAdminEmail(request);

  if (!adminEmail) {
    return Response.json({ error: "Không có quyền quản trị." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const gameKey = formData.get("gameKey");

  if (!(file instanceof File)) {
    return Response.json({ error: "Thiếu file ảnh." }, { status: 400 });
  }

  if (typeof gameKey !== "string" || !GAME_KEYS.has(gameKey)) {
    return Response.json({ error: "gameKey không hợp lệ." }, { status: 400 });
  }

  const extension = ALLOWED_EXTENSION_BY_TYPE.get(file.type.toLowerCase());

  if (!extension) {
    return Response.json(
      { error: "Định dạng ảnh không hợp lệ (chỉ nhận WebP/PNG đã nén sẵn từ trình duyệt)." },
      { status: 400 }
    );
  }

  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Ảnh vượt quá 3MB sau khi nén. Hãy thử ảnh khác." }, { status: 400 });
  }

  const objectKey = `roles/${gameKey}/${crypto.randomUUID()}.${extension}`;

  try {
    await putAvatarObject(objectKey, file, file.type);
  } catch {
    return Response.json({ error: "Không thể tải ảnh lên. Vui lòng thử lại." }, { status: 503 });
  }

  const publicBaseUrl = getPublicBaseUrl();

  if (!publicBaseUrl) {
    return Response.json({ error: "Chưa cấu hình public URL cho ảnh." }, { status: 503 });
  }

  return Response.json({ key: objectKey, url: objectKeyToUrl(publicBaseUrl, objectKey) });
}

// Xoá 1 ảnh khỏi gallery. Caller (src/lib/admin-game-roles.ts, deleteGameRoleGalleryImage) chịu
// trách nhiệm kiểm tra ảnh không còn role nào dùng TRƯỚC khi gọi route này — route chỉ xoá object
// theo key, không tự kiểm tra lại (đơn giản hoá, vì đây là tool nội bộ chỉ admin gọi được).
export async function DELETE(request: Request) {
  const adminEmail = await getRequestAdminEmail(request);

  if (!adminEmail) {
    return Response.json({ error: "Không có quyền quản trị." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { key?: string } | null;
  const key = body?.key?.trim();

  if (!key || !key.startsWith("roles/")) {
    return Response.json({ error: "key ảnh không hợp lệ." }, { status: 400 });
  }

  try {
    await deleteAvatarObject(key);
  } catch {
    return Response.json({ error: "Không thể xoá ảnh. Vui lòng thử lại." }, { status: 503 });
  }

  return Response.json({ ok: true });
}
