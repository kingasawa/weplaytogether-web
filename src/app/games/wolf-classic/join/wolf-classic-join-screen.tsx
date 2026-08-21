"use client";

import GameRoomCodeJoinClient from "@/app/games/game-room-code-join-client";
import {
  joinClassicWolfRoom,
  listPublicClassicWolfRooms,
} from "../actions";
import styles from "../../wolf/page.module.css";

export default function ClassicWolfJoinScreen() {
  return (
    <GameRoomCodeJoinClient
      gameName="Ma Sói Nhiều Đêm"
      gamePath="/games/wolf-classic"
      themeClassName={styles.classicWolfTheme}
      titleId="classic-wolf-join-room-title"
      roomCodeInputId="classic-wolf-join-room-code"
      guestNameInputId="classic-wolf-join-guest-name"
      listPublicRooms={listPublicClassicWolfRooms}
      joinRoom={joinClassicWolfRoom}
    />
  );
}
