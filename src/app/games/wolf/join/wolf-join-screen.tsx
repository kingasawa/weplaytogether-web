"use client";

import GameRoomCodeJoinClient from "@/app/games/game-room-code-join-client";
import { joinWolfRoom, listPublicWolfRooms } from "../actions";
import styles from "../page.module.css";

export default function WolfJoinScreen() {
  return (
    <GameRoomCodeJoinClient
      gameName="Ma Sói Một Đêm"
      gamePath="/games/wolf"
      themeClassName={styles.classicWolfTheme}
      titleId="wolf-join-room-title"
      roomCodeInputId="wolf-join-room-code"
      guestNameInputId="wolf-join-guest-name"
      gameBackgroundSrc="/images/boards/wolf.png"
      gameBackgroundAlt="Ảnh nền phòng Ma Sói Một Đêm"
      listPublicRooms={listPublicWolfRooms}
      joinRoom={joinWolfRoom}
    />
  );
}
