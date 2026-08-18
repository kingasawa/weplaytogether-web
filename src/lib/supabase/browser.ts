import { createClient } from "@supabase/supabase-js";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

let browserClient: SupabaseBrowserClient | null = null;

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase public environment variables.");
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        // Tắt tự động đổi code trong URL: trang /auth/callback tự gọi exchangeCodeForSession.
        // Nếu bật, client sẽ đổi code (và tiêu thụ code verifier) trước, khiến lần exchange
        // thủ công báo lỗi "PKCE code verifier not found in storage".
        detectSessionInUrl: false,
        flowType: "pkce",
        persistSession: true,
      },
    });
  }

  return browserClient;
}
