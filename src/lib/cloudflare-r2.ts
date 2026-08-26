import { getCloudflareContext } from "@opennextjs/cloudflare";

type AvatarR2Bucket = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string,
    options?: {
      httpMetadata?: {
        cacheControl?: string;
        contentType?: string;
      };
    }
  ) => Promise<unknown>;
  delete: (key: string | string[]) => Promise<void>;
};

type AvatarCloudflareEnv = CloudflareEnv & {
  AVATAR_BUCKET?: AvatarR2Bucket;
};

async function getAvatarBucket() {
  const { env } = await getCloudflareContext({ async: true });
  return (env as AvatarCloudflareEnv).AVATAR_BUCKET ?? null;
}

// Tên hàm giữ nguyên "Avatar" vì đây là chỗ đầu tiên dùng bucket này (folder "avatar/"), nhưng
// hàm hoàn toàn generic (chỉ put/delete theo key) nên cũng được dùng cho ảnh vật phẩm shop
// (folder "shop/", xem src/app/api/admin/shop-items/image/route.ts) — cùng 1 bucket R2 duy nhất.
export async function putAvatarObject(key: string, file: File, contentType: string) {
  const bucket = await getAvatarBucket();

  if (!bucket) {
    throw new Error("Missing Cloudflare R2 AVATAR_BUCKET binding.");
  }

  await bucket.put(key, file, {
    httpMetadata: {
      cacheControl: "public, max-age=31536000, immutable",
      contentType,
    },
  });
}

export async function deleteAvatarObject(key: string) {
  const bucket = await getAvatarBucket();

  if (!bucket) {
    return;
  }

  await bucket.delete(key);
}
