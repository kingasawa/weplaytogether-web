import type { Metadata } from "next";
import EditGameRoleScreen from "./edit-game-role-screen";

export const metadata: Metadata = {
  title: "Sửa role | Quản trị",
};

type EditGameRolePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditGameRolePage({ params }: EditGameRolePageProps) {
  const { id } = await params;

  return <EditGameRoleScreen roleId={id} />;
}
