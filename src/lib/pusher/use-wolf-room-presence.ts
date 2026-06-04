"use client";

import { useEffect, useState } from "react";
import { getWolfRoomChannelName, WOLF_PLAY_UPDATED_EVENT, WOLF_ROOM_UPDATED_EVENT } from "./channels";
import { createPusherBrowserClient } from "./client";

type PresenceMember = {
  id: string;
};

type PresenceMembers = {
  each(callback: (member: PresenceMember) => void): void;
};

type PresenceChannel = {
  bind(eventName: string, callback: (data: unknown) => void): void;
  unbind_all(): void;
};

type UseWolfRoomPresenceOptions = {
  enabled: boolean;
  roomCode: string;
  onRoomUpdate?: () => void | Promise<void>;
  onPlayUpdate?: () => void | Promise<void>;
};

function collectMemberIds(members: PresenceMembers) {
  const memberIds: string[] = [];
  members.each((member) => memberIds.push(member.id));
  return memberIds;
}

export function useWolfRoomPresence({
  enabled,
  roomCode,
  onRoomUpdate,
  onPlayUpdate,
}: UseWolfRoomPresenceOptions) {
  const [connectionStatus, setConnectionStatus] = useState("\u0110ang k\u1ebft n\u1ed1i Ng\u01b0\u1eddi ch\u01a1i...");
  const [isPresenceReady, setIsPresenceReady] = useState(false);
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isCancelled = false;
    let subscribedChannelName: string | null = null;
    let subscribedChannel: PresenceChannel | null = null;

    async function subscribeToPresence() {
      const pusher = await createPusherBrowserClient();

      if (isCancelled) {
        return;
      }

      if (!pusher) {
        setConnectionStatus("Ng\u01b0\u1eddi ch\u01a1i ch\u01b0a c\u1ea5u h\u00ecnh");
        setIsPresenceReady(false);
        setOnlinePlayerIds([]);
        return;
      }

      const channelName = getWolfRoomChannelName(roomCode);
      const channel = pusher.subscribe(channelName) as unknown as PresenceChannel;

      subscribedChannelName = channelName;
      subscribedChannel = channel;

      channel.bind("pusher:subscription_succeeded", (members: unknown) => {
        setConnectionStatus("Ng\u01b0\u1eddi ch\u01a1i \u0111\u00e3 k\u1ebft n\u1ed1i");
        setIsPresenceReady(true);
        setOnlinePlayerIds(collectMemberIds(members as PresenceMembers));
      });
      channel.bind("pusher:subscription_error", () => {
        setConnectionStatus("Kh\u00f4ng th\u1ec3 x\u00e1c th\u1ef1c Ng\u01b0\u1eddi ch\u01a1i");
        setIsPresenceReady(false);
        setOnlinePlayerIds([]);
      });
      channel.bind("pusher:member_added", (member: unknown) => {
        const nextMember = member as PresenceMember;
        setOnlinePlayerIds((current) =>
          current.includes(nextMember.id) ? current : [...current, nextMember.id]
        );
      });
      channel.bind("pusher:member_removed", (member: unknown) => {
        const nextMember = member as PresenceMember;
        setOnlinePlayerIds((current) => current.filter((memberId) => memberId !== nextMember.id));
      });
      channel.bind(WOLF_ROOM_UPDATED_EVENT, () => {
        onRoomUpdate?.();
      });
      channel.bind(WOLF_PLAY_UPDATED_EVENT, () => {
        onPlayUpdate?.();
      });
    }

    void subscribeToPresence().catch(() => {
      if (!isCancelled) {
        setConnectionStatus("Kh\u00f4ng th\u1ec3 k\u1ebft n\u1ed1i Ng\u01b0\u1eddi ch\u01a1i");
        setIsPresenceReady(false);
        setOnlinePlayerIds([]);
      }
    });

    return () => {
      isCancelled = true;

      if (subscribedChannel && subscribedChannelName) {
        const channelNameToUnsubscribe = subscribedChannelName;
        subscribedChannel.unbind_all();
        void createPusherBrowserClient().then((pusher) => {
          pusher?.unsubscribe(channelNameToUnsubscribe);
        });
      }
    };
  }, [enabled, onPlayUpdate, onRoomUpdate, roomCode]);

  return {
    connectionStatus: !enabled ? "V\u00e0o ph\u00f2ng \u0111\u1ec3 k\u1ebft n\u1ed1i Ng\u01b0\u1eddi ch\u01a1i" : connectionStatus,
    isPresenceReady: enabled && isPresenceReady,
    onlinePlayerIds: enabled ? onlinePlayerIds : [],
  };
}