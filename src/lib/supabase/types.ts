export type WolfRoomStatus = "waiting" | "playing" | "finished";
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type WolfGamePhase =
  | "card_reveal"
  | "night"
  | "night_review"
  | "discussion"
  | "voting"
  | "result";
export type WolfRole =
  | "werewolf"
  | "werewolf_seer"
  | "villager"
  | "seer"
  | "robber"
  | "troublemaker"
  | "witch"
  | "drunk"
  | "insomniac"
  | "doppelganger"
  | "copycat";

export type WolfRoomRow = {
  id: string;
  code: string;
  game_key: string;
  is_public: boolean;
  status: WolfRoomStatus;
  host_player_id: string | null;
  current_game_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WolfRoomPlayerRow = {
  id: string;
  room_id: string;
  session_id: string;
  name: string;
  avatar_key: string;
  is_host: boolean;
  is_ready: boolean;
  joined_at: string;
  updated_at: string;
};

export type WolfGameSessionRow = {
  id: string;
  room_id: string;
  phase: WolfGamePhase;
  round_number: number;
  discussion_ends_at: string | null;
  result_snapshot: Json | null;
  created_at: string;
  updated_at: string;
};

export type ClassicWolfGameStateRow = {
  game_id: string;
  state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AvalonGameStateRow = {
  game_id: string;
  state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WolfGameCardRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  center_index: number | null;
  original_role: WolfRole;
  current_role: WolfRole;
  created_at: string;
};

export type WolfGameActionRow = {
  id: string;
  game_id: string;
  player_id: string;
  action_type: string;
  target_player_id: string | null;
  target_player_id_2: string | null;
  target_player_id_3: string | null;
  target_center_index: number | null;
  target_center_index_2: number | null;
  target_center_index_3: number | null;
  created_at: string;
  updated_at: string;
};

export type WolfGameVoteRow = {
  id: string;
  game_id: string;
  voter_player_id: string;
  target_player_id: string | null;
  is_skip: boolean;
  created_at: string;
  updated_at: string;
};

export type WolfGamePhaseConfirmationRow = {
  id: string;
  game_id: string;
  player_id: string;
  phase: WolfGamePhase;
  created_at: string;
};

export type ShopItemType = "avatar_frame" | "profile_frame";

export type ShopItemRow = {
  id: string;
  item_type: ShopItemType;
  name: string;
  description: string | null;
  price_coins: number;
  image_url: string;
  // Màu riêng của khung (chuỗi màu CSS, vd "#5D7CFF"), chỉ có ý nghĩa với item_type=profile_frame
  // — dùng để tô lớp kính .playerRowFrameInnerGlass theo tông màu khung. null = dùng màu mặc định.
  frame_color: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type UserShopItemRow = {
  id: string;
  user_id: string;
  item_id: string;
  price_paid_coins: number;
  purchased_at: string;
};

export type PlayerScoreEventRow = {
  id: string;
  user_id: string;
  game_key: string;
  game_id: string;
  room_code: string;
  team: string;
  role: string;
  is_winner: boolean;
  points_awarded: number;
  coins_awarded: number;
  xp_awarded: number;
  created_at: string;
};

export type LeaderboardRow = {
  id: string;
  display_name: string | null;
  avatar_key: string;
  avatar_object_key: string | null;
  total_points: number;
  total_coins: number;
  level_xp: number;
  level: number;
  level_tier: string;
};

export type Database = {
  public: {
    Tables: {
      rooms: {
        Row: WolfRoomRow;
        Insert: Partial<
          Pick<
            WolfRoomRow,
            | "id"
            | "game_key"
            | "is_public"
            | "status"
            | "host_player_id"
            | "current_game_id"
            | "created_at"
            | "updated_at"
          >
        > &
          Pick<WolfRoomRow, "code">;
        Update: Partial<Omit<WolfRoomRow, "id" | "created_at">>;
      };
      users: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_key: string;
          avatar_object_key: string | null;
          total_points: number;
          total_coins: number;
          level_xp: number;
          equipped_avatar_frame_id: string | null;
          equipped_profile_frame_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_key?: string;
          avatar_object_key?: string | null;
          total_points?: number;
          total_coins?: number;
          level_xp?: number;
          equipped_avatar_frame_id?: string | null;
          equipped_profile_frame_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string | null;
          display_name?: string | null;
          avatar_key?: string;
          avatar_object_key?: string | null;
          total_points?: number;
          total_coins?: number;
          level_xp?: number;
          equipped_avatar_frame_id?: string | null;
          equipped_profile_frame_id?: string | null;
          updated_at?: string;
        };
      };
      player_score_events: {
        Row: PlayerScoreEventRow;
        Insert: Partial<
          Pick<PlayerScoreEventRow, "id" | "points_awarded" | "coins_awarded" | "xp_awarded" | "created_at">
        > &
          Pick<
            PlayerScoreEventRow,
            "user_id" | "game_key" | "game_id" | "room_code" | "team" | "role" | "is_winner"
          >;
        Update: Partial<Omit<PlayerScoreEventRow, "id" | "user_id" | "game_id" | "created_at">>;
      };
      shop_items: {
        Row: ShopItemRow;
        Insert: Partial<Pick<ShopItemRow, "id" | "description" | "price_coins" | "frame_color" | "is_active" | "sort_order" | "created_at" | "updated_at">> &
          Pick<ShopItemRow, "item_type" | "name" | "image_url">;
        Update: Partial<Omit<ShopItemRow, "id" | "created_at">>;
      };
      user_shop_items: {
        Row: UserShopItemRow;
        Insert: Partial<Pick<UserShopItemRow, "id" | "price_paid_coins" | "purchased_at">> &
          Pick<UserShopItemRow, "user_id" | "item_id">;
        Update: Partial<Omit<UserShopItemRow, "id" | "user_id" | "item_id">>;
      };
      room_players: {
        Row: WolfRoomPlayerRow;
        Insert: Partial<
          Pick<
            WolfRoomPlayerRow,
            "id" | "avatar_key" | "is_host" | "is_ready" | "joined_at" | "updated_at"
          >
        > &
          Pick<WolfRoomPlayerRow, "room_id" | "session_id" | "name">;
        Update: Partial<Omit<WolfRoomPlayerRow, "id" | "room_id" | "joined_at">>;
      };
      game_sessions: {
        Row: WolfGameSessionRow;
        Insert: Partial<
          Pick<
            WolfGameSessionRow,
            | "id"
            | "phase"
            | "round_number"
            | "discussion_ends_at"
            | "result_snapshot"
            | "created_at"
            | "updated_at"
          >
        > &
          Pick<WolfGameSessionRow, "room_id">;
        Update: Partial<Omit<WolfGameSessionRow, "id" | "room_id" | "created_at">>;
      };
      game_cards: {
        Row: WolfGameCardRow;
        Insert: Partial<Pick<WolfGameCardRow, "id" | "player_id" | "center_index" | "created_at">> &
          Pick<WolfGameCardRow, "game_id" | "original_role" | "current_role">;
        Update: Partial<Omit<WolfGameCardRow, "id" | "game_id" | "created_at">>;
      };
      game_actions: {
        Row: WolfGameActionRow;
        Insert: Partial<
          Pick<
            WolfGameActionRow,
            | "id"
            | "target_player_id"
            | "target_player_id_2"
            | "target_player_id_3"
            | "target_center_index"
            | "target_center_index_2"
            | "target_center_index_3"
            | "created_at"
            | "updated_at"
          >
        > &
          Pick<WolfGameActionRow, "game_id" | "player_id" | "action_type">;
        Update: Partial<Omit<WolfGameActionRow, "id" | "game_id" | "player_id" | "created_at">>;
      };
      game_votes: {
        Row: WolfGameVoteRow;
        Insert: Partial<Pick<WolfGameVoteRow, "id" | "created_at" | "updated_at">> &
          Pick<WolfGameVoteRow, "game_id" | "voter_player_id"> &
          Partial<Pick<WolfGameVoteRow, "target_player_id" | "is_skip">>;
        Update: Partial<Omit<WolfGameVoteRow, "id" | "game_id" | "voter_player_id" | "created_at">>;
      };
      classic_wolf_game_states: {
        Row: ClassicWolfGameStateRow;
        Insert: Partial<Pick<ClassicWolfGameStateRow, "created_at" | "updated_at">> &
          Pick<ClassicWolfGameStateRow, "game_id" | "state">;
        Update: Partial<Omit<ClassicWolfGameStateRow, "game_id" | "created_at">>;
      };
      avalon_game_states: {
        Row: AvalonGameStateRow;
        Insert: Partial<Pick<AvalonGameStateRow, "created_at" | "updated_at">> &
          Pick<AvalonGameStateRow, "game_id" | "state">;
        Update: Partial<Omit<AvalonGameStateRow, "game_id" | "created_at">>;
      };
      game_phase_confirmations: {
        Row: WolfGamePhaseConfirmationRow;
        Insert: Partial<Pick<WolfGamePhaseConfirmationRow, "id" | "created_at">> &
          Pick<WolfGamePhaseConfirmationRow, "game_id" | "player_id" | "phase">;
        Update: Partial<Omit<WolfGamePhaseConfirmationRow, "id" | "game_id" | "player_id" | "created_at">>;
      };
    };
    Views: {
      leaderboard: {
        Row: LeaderboardRow;
      };
    };
    Functions: {
      award_wolf_game_points: {
        Args: {
          p_game_id: string;
          p_room_code: string;
          p_game_key: string;
          p_awards: Json;
        };
        Returns: void;
      };
      get_user_level: {
        Args: {
          p_level_xp: number;
        };
        Returns: number;
      };
      get_user_level_tier: {
        Args: {
          p_level: number;
        };
        Returns: string;
      };
      purchase_shop_item: {
        Args: {
          p_item_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      wolf_room_status: WolfRoomStatus;
      wolf_game_phase: WolfGamePhase;
      wolf_role: WolfRole;
      shop_item_type: ShopItemType;
    };
  };
};
