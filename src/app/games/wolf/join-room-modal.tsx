"use client";

import { KeyRound, LogIn, RefreshCw, Users, X } from "lucide-react";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { RoomCodeInput } from "./room-code-input";
import styles from "./page.module.css";

export type JoinRoomModalRoom = {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
};

type JoinTab = "code" | "public";

type JoinRoomModalProps = {
  /** Ảnh nền riêng theo game (avalon / wolf / wolf-classic) */
  backgroundSrc: string;
  backgroundAlt: string;
  roomCode: string;
  roomCodeError: string;
  isPending: boolean;
  publicRooms: JoinRoomModalRoom[];
  publicRoomsError: string;
  isRoomListPending: boolean;
  onClose: () => void;
  onRoomCodeChange: (value: string) => void;
  onSubmitJoin: (event: FormEvent<HTMLFormElement>) => void;
  onRefreshPublicRooms: () => void;
  onJoinPublicRoom: (code: string) => void;
};

export function JoinRoomModal({
  backgroundSrc,
  backgroundAlt,
  roomCode,
  roomCodeError,
  isPending,
  publicRooms,
  publicRoomsError,
  isRoomListPending,
  onClose,
  onRoomCodeChange,
  onSubmitJoin,
  onRefreshPublicRooms,
  onJoinPublicRoom,
}: JoinRoomModalProps) {
  const [activeTab, setActiveTab] = useState<JoinTab>("code");

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        aria-labelledby="join-room-title"
        aria-modal="true"
        className={`${styles.modal} ${styles.joinRoomModal}`}
        role="dialog"
      >
        <div className={styles.joinModalBanner} aria-hidden="true">
          <Image alt={backgroundAlt} fill sizes="(max-width: 768px) 100vw, 34rem" src={backgroundSrc} />
        </div>

        <button
          className={styles.closeButton}
          type="button"
          aria-label="Đóng tham gia phòng"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>

        <header className={styles.joinModalHeader}>
          <h2 id="join-room-title">Tham gia phòng</h2>
        </header>

        <div className={styles.joinTabs} role="tablist" aria-label="Cách tham gia phòng">
          <span
            className={`${styles.joinTabIndicator} ${
              activeTab === "public" ? styles.joinTabIndicatorRight : ""
            }`}
            aria-hidden="true"
          />
          <button
            className={`${styles.joinTab} ${activeTab === "code" ? styles.joinTabActive : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "code"}
            onClick={() => setActiveTab("code")}
          >
            <KeyRound aria-hidden="true" />
            Nhập mã
          </button>
          <button
            className={`${styles.joinTab} ${activeTab === "public" ? styles.joinTabActive : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "public"}
            onClick={() => setActiveTab("public")}
          >
            <Users aria-hidden="true" />
            Phòng public
          </button>
        </div>

        {activeTab === "code" ? (
          <form className={styles.joinPanel} onSubmit={onSubmitJoin}>
            <div className={styles.joinPanelHeading}>
              <KeyRound aria-hidden="true" />
              <div>
                <h3>Nhập mã phòng</h3>
                <p>Nhập 4 ký tự mã phòng để tham gia.</p>
              </div>
            </div>

            <RoomCodeInput value={roomCode} onChange={onRoomCodeChange} />

            {roomCodeError && <span className={styles.errorText}>{roomCodeError}</span>}

            <button
              className={`${styles.primaryButton} ${styles.joinSubmitButton}`}
              type="submit"
              disabled={isPending}
            >
              {isPending ? "ĐANG VÀO..." : "VÀO PHÒNG"}
            </button>
          </form>
        ) : (
          <div className={styles.joinPanel}>
            <div className={styles.publicRoomsHeader}>
              <h3>Danh sách</h3>
              <button
                className={styles.refreshIconButton}
                type="button"
                aria-label={isRoomListPending ? "Đang tải danh sách phòng" : "Làm mới danh sách phòng"}
                disabled={isRoomListPending}
                onClick={onRefreshPublicRooms}
              >
                <RefreshCw aria-hidden="true" />
              </button>
            </div>

            {publicRoomsError && <span className={styles.errorText}>{publicRoomsError}</span>}

            {!publicRoomsError && isRoomListPending && publicRooms.length === 0 && (
              <p className={styles.publicRoomsEmpty}>Đang tải phòng public...</p>
            )}

            {!publicRoomsError && !isRoomListPending && publicRooms.length === 0 && (
              <p className={styles.publicRoomsEmpty}>Chưa có phòng public đang mở.</p>
            )}

            {publicRooms.length > 0 && (
              <ul className={styles.publicRoomList}>
                {publicRooms.map((room) => {
                  const isFull = room.playerCount >= room.maxPlayers;

                  return (
                    <li className={styles.publicRoomItem} key={room.code}>
                      <dl className={styles.publicRoomMeta}>
                        <div>
                          <dt>Room</dt>
                          <dd className={styles.publicRoomCode}>{room.code.toUpperCase()}</dd>
                        </div>
                        <div>
                          <dt>Players</dt>
                          <dd>
                            {room.playerCount}/{room.maxPlayers}
                          </dd>
                        </div>
                        <div>
                          <dt>Host</dt>
                          <dd>{room.hostName}</dd>
                        </div>
                      </dl>
                      <button
                        className={`${styles.primaryButton} ${styles.joinSubmitButton} ${styles.publicRoomJoinButton}`}
                        type="button"
                        aria-label={isFull ? `Phòng ${room.code.toUpperCase()} đã đầy` : `Tham gia phòng ${room.code.toUpperCase()}`}
                        disabled={isPending || isFull}
                        onClick={() => onJoinPublicRoom(room.code)}
                      >
                        <LogIn aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
