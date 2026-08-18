import type { Metadata } from "next";
import ProfileScreen from "./profile-screen";

export const metadata: Metadata = {
  title: "Hồ sơ | Boardverse",
};

export default function ProfilePage() {
  return <ProfileScreen />;
}
