import type { Metadata } from "next";
import ItemFormScreen from "../item-form-screen";

export const metadata: Metadata = {
  title: "Thêm vật phẩm | Quản trị",
};

export default function NewShopItemPage() {
  return <ItemFormScreen formMode={{ mode: "create" }} />;
}
