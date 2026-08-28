import { Storage } from "@google-cloud/storage";

// Trên App Engine, Storage() tự xác thực qua Application Default Credentials của service account
// mặc định (metadata server) — không cần key/secret nào trong code hay biến môi trường.
const storage = new Storage();
const BUCKET_NAME = process.env.GCS_BUCKET_NAME ?? "weplaytogether-uploads";
const bucket = storage.bucket(BUCKET_NAME);

// Tên hàm giữ nguyên "Avatar" vì đây là chỗ đầu tiên dùng bucket này (folder "avatar/"), nhưng
// hàm hoàn toàn generic (chỉ lưu/xoá theo key) nên cũng được dùng cho ảnh vật phẩm shop
// (folder "shop/", xem src/app/api/admin/shop-items/image/route.ts) — cùng 1 bucket GCS duy nhất.
export async function putAvatarObject(key: string, file: File, contentType: string) {
  const buffer = Buffer.from(await file.arrayBuffer());

  await bucket.file(key).save(buffer, {
    contentType,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
}

export async function deleteAvatarObject(key: string) {
  await bucket.file(key).delete({ ignoreNotFound: true });
}
