export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (!process.env.GAE_APPLICATION) {
    // Chỉ đọc Secret Manager khi thực sự chạy trên App Engine — không phải lúc `next dev` cục bộ.
    return;
  }

  const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
  const client = new SecretManagerServiceClient();
  const projectId = await client.getProjectId();
  const secretNames = ["SUPABASE_SERVICE_ROLE_KEY", "PUSHER_SECRET"];

  await Promise.all(
    secretNames.map(async (name) => {
      const [version] = await client.accessSecretVersion({
        name: `projects/${projectId}/secrets/${name}/versions/latest`,
      });

      const value = version.payload?.data?.toString("utf8");

      if (value) {
        process.env[name] = value;
      }
    })
  );
}
