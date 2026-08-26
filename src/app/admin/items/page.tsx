import type { Metadata } from "next";
import AdminItemsScreen from "./admin-items-screen";

export const metadata: Metadata = {
  title: "Vật phẩm | Quản trị",
};

export default function AdminItemsPage() {
  return <AdminItemsScreen />;
}
