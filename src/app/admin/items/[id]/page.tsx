import type { Metadata } from "next";
import EditItemScreen from "./edit-item-screen";

export const metadata: Metadata = {
  title: "Sửa vật phẩm | Quản trị",
};

type EditShopItemPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditShopItemPage({ params }: EditShopItemPageProps) {
  const { id } = await params;

  return <EditItemScreen itemId={id} />;
}
