import type { Metadata } from "next";
import ProfileScreen from "./profile-screen";

export const metadata: Metadata = {
  title: "Hồ sơ | WePlayTogether",
};

export default function ProfilePage() {
  return <ProfileScreen />;
}
