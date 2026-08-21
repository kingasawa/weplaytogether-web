"use client";

import { ArrowLeft, Play, RefreshCw, UsersRound } from "lucide-react";
import type { FormEvent } from "react";
import styles from "./wolf/page.module.css";

type PublicRoomSummary = {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
};

type RoomCodeJoinScreenProps = {
  gameName: string;
  themeClassName: string;
  titleId: string;
  roomCodeInputId: string;
  roomCode: string;
  roomCodeError: string;
  publicRooms: PublicRoomSummary[];
  publicRoomsError: string;
  isPending: boolean;
  isRoomListPending: boolean;
  onBack: () => void;
  onRefreshPublicRooms: () => void;
  onJoinPublicRoom: (roomCode: string) => void;
  onRoomCodeChange: (roomCode: string) => void;
  onSubmitRoomCode: (event: FormEvent<HTMLFormElement>) => void;
};

export default function RoomCodeJoinScreen({
  gameName,
  themeClassName,
  titleId,
  roomCodeInputId,
  roomCode,
  roomCodeError,
  publicRooms,
  publicRoomsError,
  isPending,
  isRoomListPending,
  onBack,
  onRefreshPublicRooms,
  onJoinPublicRoom,
  onRoomCodeChange,
  onSubmitRoomCode,
}: RoomCodeJoinScreenProps) {
  return (
    <main className={`${styles.page} ${styles.joinRoomScreenPage} ${themeClassName}`}>
      <section className={styles.joinRoomScreenPanel} aria-labelledby={titleId}>
        <button className={styles.joinIdentityBackButton} type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Quay lại
        </button>

        <header className={styles.joinIdentityHeader}>
          <span className={styles.joinIdentityEyebrow}>
            <UsersRound aria-hidden="true" />
            {gameName}
          </span>
          <h1 id={titleId}>Tham gia phòng</h1>
          <p>Chọn phòng public đang mở hoặc nhập mã phòng.</p>
        </header>

        <div className={`${styles.publicRoomsPanel} ${styles.joinRoomPublicPanel}`}>
          <div className={styles.publicRoomsHeader}>
            <h2>Phòng public</h2>
            <button
              className={styles.smallButton}
              type="button"
              disabled={isRoomListPending}
              onClick={onRefreshPublicRooms}
            >
              <RefreshCw aria-hidden="true" />
              {isRoomListPending ? "Đang tải" : "Làm mới"}
            </button>
          </div>
          {publicRoomsError && <p className={styles.inlineError}>{publicRoomsError}</p>}
          {!publicRoomsError && isRoomListPending && publicRooms.length === 0 && (
            <p className={styles.publicRoomsEmpty}>Đang tải phòng public...</p>
          )}
          {!publicRoomsError && !isRoomListPending && publicRooms.length === 0 && (
            <p className={styles.publicRoomsEmpty}>Chưa có phòng public đang mở.</p>
          )}
          {publicRooms.length > 0 && (
            <table className={styles.publicRoomTable}>
              <thead>
                <tr>
                  <th scope="col">Mã phòng</th>
                  <th scope="col">Host</th>
                  <th scope="col">Người chơi</th>
                  <th scope="col">Vào</th>
                </tr>
              </thead>
              <tbody>
                {publicRooms.map((room) => (
                  <tr key={room.code}>
                    <td data-label="Mã phòng">
                      <strong>{room.code.toUpperCase()}</strong>
                    </td>
                    <td data-label="Host">{room.hostName}</td>
                    <td data-label="Người chơi">
                      {room.playerCount}/{room.maxPlayers}
                    </td>
                    <td>
                      <button
                        className={styles.smallButton}
                        type="button"
                        disabled={isPending || room.playerCount >= room.maxPlayers}
                        onClick={() => onJoinPublicRoom(room.code)}
                      >
                        <Play aria-hidden="true" />
                        {room.playerCount >= room.maxPlayers ? "ĐẦY" : "VÀO"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <form className={`${styles.joinForm} ${styles.joinRoomScreenForm}`} onSubmit={onSubmitRoomCode}>
          <label htmlFor={roomCodeInputId}>Mã phòng</label>
          <input
            autoFocus
            id={roomCodeInputId}
            inputMode="text"
            maxLength={4}
            pattern="[A-Za-z]{4}"
            placeholder="abcd"
            type="text"
            value={roomCode}
            onChange={(event) => onRoomCodeChange(event.target.value)}
          />
          {roomCodeError && <span className={styles.errorText}>{roomCodeError}</span>}
          <button className={styles.primaryButton} type="submit" disabled={isPending}>
            <Play aria-hidden="true" />
            {isPending ? "ĐANG VÀO..." : "VÀO PHÒNG"}
          </button>
        </form>
      </section>
    </main>
  );
}
