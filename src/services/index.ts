export type SaveGamePayload = {
  gameId: string;
  state: unknown;
};

export async function saveGame(payload: SaveGamePayload): Promise<void> {
  // TODO: kết nối với backend / Supabase
  console.log("Saving game:", payload.gameId);
}

export async function loadGame(gameId: string): Promise<unknown | null> {
  // TODO: kết nối với backend / Supabase
  console.log("Loading game:", gameId);
  return null;
}
