export type WolfRoomStatus = "waiting" | "playing" | "finished";

export type WolfRoomRow = {
  id: string;
  code: string;
  game_key: string;
  status: WolfRoomStatus;
  host_player_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WolfRoomPlayerRow = {
  id: string;
  room_id: string;
  session_id: string;
  name: string;
  is_host: boolean;
  is_ready: boolean;
  joined_at: string;
  last_seen_at: string;
  left_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      wolf_rooms: {
        Row: WolfRoomRow;
        Insert: Partial<Pick<WolfRoomRow, "id" | "game_key" | "status" | "host_player_id" | "created_at" | "updated_at">> &
          Pick<WolfRoomRow, "code">;
        Update: Partial<Omit<WolfRoomRow, "id" | "created_at">>;
      };
      wolf_room_players: {
        Row: WolfRoomPlayerRow;
        Insert: Partial<Pick<WolfRoomPlayerRow, "id" | "is_host" | "is_ready" | "joined_at" | "last_seen_at" | "left_at">> &
          Pick<WolfRoomPlayerRow, "room_id" | "session_id" | "name">;
        Update: Partial<Omit<WolfRoomPlayerRow, "id" | "room_id" | "joined_at">>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      wolf_room_status: WolfRoomStatus;
    };
  };
};
