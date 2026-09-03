import type { Metadata } from "next";
import AdminReportsScreen from "./admin-reports-screen";

export const metadata: Metadata = {
  title: "Report lỗi | Quản trị",
};

export default function AdminReportsPage() {
  return <AdminReportsScreen />;
}
