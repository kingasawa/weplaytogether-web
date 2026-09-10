import type { Metadata } from "next";
import AdminGameRolesScreen from "./admin-game-roles-screen";

export const metadata: Metadata = {
  title: "Role trong game | Quản trị",
};

export default function AdminGameRolesPage() {
  return <AdminGameRolesScreen />;
}
