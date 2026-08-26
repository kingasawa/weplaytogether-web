"use client";

import type { Session } from "@supabase/supabase-js";
import { LayoutDashboard, LoaderCircle, LogOut, Package, ShieldAlert, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isAdminEmail } from "@/lib/admin";
import { isAllowedGmailSession, signOutFromSupabase } from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./admin.module.css";

type GateStatus = "checking" | "denied" | "allowed";

const NAV_ITEMS = [
  { href: "/admin/items", label: "Vật phẩm", icon: Package },
  { href: "/admin/users", label: "Người dùng", icon: Users },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<GateStatus>("checking");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createSupabaseBrowserClient();

    async function applySession(nextSession: Session | null) {
      if (!isMounted) {
        return;
      }

      const isAdmin =
        Boolean(nextSession) && isAllowedGmailSession(nextSession) && isAdminEmail(nextSession?.user.email);

      setSession(nextSession);
      setStatus(isAdmin ? "allowed" : "denied");
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => {
        if (isMounted) {
          setStatus("denied");
        }
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <div className={`admin-app-root ${styles.appRoot}`}>
      {status === "checking" && (
        <div className={styles.gateScreen}>
          <LoaderCircle className={styles.gateSpinner} aria-hidden="true" />
          <p>Đang kiểm tra quyền quản trị...</p>
        </div>
      )}

      {status === "denied" && (
        <div className={styles.gateScreen}>
          <span className={styles.gateIcon}>
            <ShieldAlert aria-hidden="true" />
          </span>
          <h1>Không có quyền truy cập</h1>
          <p>Tài khoản này không có quyền quản trị. Đăng nhập bằng tài khoản admin để tiếp tục.</p>
          <Link className={styles.gateHomeLink} href="/">
            Về trang chủ
          </Link>
        </div>
      )}

      {status === "allowed" && (
        <div className={styles.dashboardShell}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarBrand}>
              <LayoutDashboard aria-hidden="true" />
              <span>Quản trị</span>
            </div>

            <nav className={styles.sidebarNav} aria-label="Điều hướng quản trị">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  className={`${styles.sidebarLink} ${pathname?.startsWith(href) ? styles.sidebarLinkActive : ""}`}
                  href={href}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </nav>

            <div className={styles.sidebarFooter}>
              <span className={styles.sidebarEmail}>{session?.user.email}</span>
              <button
                className={styles.sidebarSignOut}
                type="button"
                onClick={() => {
                  void signOutFromSupabase();
                }}
              >
                <LogOut aria-hidden="true" />
                Đăng xuất
              </button>
              <Link className={styles.sidebarSiteLink} href="/">
                Về trang WePlayTogether
              </Link>
            </div>
          </aside>

          <main className={styles.content}>{children}</main>
        </div>
      )}

      <div className={styles.desktopOnlyNotice}>
        <ShieldAlert aria-hidden="true" />
        <h1>Chỉ hỗ trợ máy tính</h1>
        <p>Trang quản trị được thiết kế cho màn hình rộng. Vui lòng mở trên máy tính (≥ 1024px).</p>
      </div>
    </div>
  );
}
