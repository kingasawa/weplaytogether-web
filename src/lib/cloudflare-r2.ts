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
