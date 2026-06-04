import { cookies } from "next/headers";
import { getWolfRoomCodeFromChannel } from "@/lib/pusher/channels";
import { authorizePusherPresenceChannel } from "@/lib/pusher/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { WOLF_PLAYER_SESSION_COOKIE } from "@/lib/wolf-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const socketId = String(formData.get("socket_id") ?? "");
  const channelName = String(formData.get("channel_name") ?? "");
  const roomCode = getWolfRoomCodeFromChannel(channelName);

  if (!socketId || !roomCode) {
    return Response.json({ error: "Invalid Pusher auth request." }, { status: 400 });
  }

  const sessionId = (await cookies()).get(WOLF_PLAYER_SESSION_COOKIE)?.value;

  if (!sessionId) {
    return Response.json({ error: "Missing player session." }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: room } = await supabase
    .from("wolf_rooms")
    .select("id")
    .eq("code", roomCode)
    .maybeSingle();

  if (!room) {
    return Response.json({ error: "Room does not exist." }, { status: 403 });
  }

  const { data: player } = await supabase
    .from("wolf_room_players")
    .select("id, name")
    .eq("session_id", sessionId)
    .eq("room_id", room.id)
    .maybeSingle();

  if (!player) {
    return Response.json({ error: "Player is not in this room." }, { status: 403 });
  }

  const authResponse = authorizePusherPresenceChannel(socketId, channelName, {
    id: player.id,
    name: player.name,
  });

  if (!authResponse) {
    return Response.json({ error: "Pusher is not configured." }, { status: 503 });
  }

  return Response.json(authResponse);
}
