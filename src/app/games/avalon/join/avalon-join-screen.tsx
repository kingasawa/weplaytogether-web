"use client";

import GameRoomCodeJoinClient from "@/app/games/game-room-code-join-client";
import { joinAvalonRoom, listPublicAvalonRooms } from "../actions";
import styles from "../../wolf/page.module.css";

export default function AvalonJoinScreen() {
  return (
    <GameRoomCodeJoinClient
      gameName="Avalon"
      gamePath="/games/avalon"
      themeClassName={`${styles.classicWolfTheme} ${styles.avalonTheme}`}
      titleId="avalon-join-room-title"
      roomCodeInputId="avalon-join-room-code"
      guestNameInputId="avalon-join-guest-name"
      listPublicRooms={listPublicAvalonRooms}
      joinRoom={joinAvalonRoom}
    />
  );
}
