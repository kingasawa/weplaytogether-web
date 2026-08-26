import type { Metadata } from "next";
import AdminUsersScreen from "./admin-users-screen";

export const metadata: Metadata = {
  title: "Người dùng | Quản trị",
};

export default function AdminUsersPage() {
  return <AdminUsersScreen />;
}
