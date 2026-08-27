"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import styles from "./page.module.css";

export const ROOM_CODE_LENGTH = 4;

/**
 * Bộ gõ tiếng Việt kiểu Telex (Unikey, EVKey...) biến phím "w" thành "ư" ngay cả khi
 * người dùng chỉ muốn gõ chữ cái Latin. Map ngược lại để không bị mất ký tự này.
 */
const TELEX_IME_CHAR_MAP: Record<string, string> = {
  ư: "w",
  Ư: "w",
};

export function sanitizeRoomCode(value: string) {
  const withoutTelexQuirks = Array.from(value)
    .map((char) => TELEX_IME_CHAR_MAP[char] ?? char)
    .join("");

  return withoutTelexQuirks.toLowerCase().replace(/[^a-z]/g, "").slice(0, ROOM_CODE_LENGTH);
}

/** Ô nhập mã phòng tách 4 ký tự, tự nhảy focus và hỗ trợ paste. */
export function RoomCodeInput({
  value,
  onChange,
  firstBoxId,
}: {
  value: string;
  onChange: (value: string) => void;
  firstBoxId?: string;
}) {
  const boxesRef = useRef<Array<HTMLInputElement | null>>([]);

  function focusBox(index: number) {
    const clamped = Math.max(0, Math.min(ROOM_CODE_LENGTH - 1, index));
    const box = boxesRef.current[clamped];
    box?.focus();
    box?.select();
  }

  function handleChange(index: number, raw: string) {
    const char = sanitizeRoomCode(raw).slice(-1);
    const chars = value.split("");

    while (chars.length <= index) {
      chars.push("");
    }
    chars[index] = char;

    const next = sanitizeRoomCode(chars.join(""));
    onChange(next);

    if (char && index < ROOM_CODE_LENGTH - 1) {
      focusBox(index + 1);
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      event.preventDefault();
      const chars = value.split("");
      chars[index - 1] = "";
      onChange(sanitizeRoomCode(chars.join("")));
      focusBox(index - 1);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = sanitizeRoomCode(event.clipboardData.getData("text"));

    if (!pasted) {
      return;
    }

    onChange(pasted);
    focusBox(pasted.length);
  }

  return (
    <div className={styles.roomCodeInput}>
      {Array.from({ length: ROOM_CODE_LENGTH }).map((_, index) => (
        <input
          key={index}
          ref={(element) => {
            boxesRef.current[index] = element;
          }}
          aria-label={`Ký tự ${index + 1} của mã phòng`}
          autoComplete="off"
          autoFocus={index === 0}
          className={styles.roomCodeBox}
          id={index === 0 ? firstBoxId : undefined}
          inputMode="text"
          maxLength={1}
          spellCheck={false}
          value={value[index] ?? ""}
          onChange={(event) => handleChange(index, event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  );
}
