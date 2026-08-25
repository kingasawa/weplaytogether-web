// FILE NÀY ĐƯỢC SINH TỪ ENGINE THẬT — không sửa tay.
// Mỗi case là output nguyên vẹn của simulateNightResolution + buildGameResult + buildAllPlayersSummary
// với bộ bài và hành động dựng sẵn, dùng để xem UI màn kết quả của Ma Sói Một Đêm.
import type { WolfRole } from "@/lib/supabase/types";
import type { WolfPlayState } from "../games/wolf/actions";

export type DebugWolfResultCase = {
  key: string;
  label: string;
  note: string;
  roleDeck: WolfRole[];
  myOriginalRole: WolfRole;
  myFinalRole: WolfRole;
  voteTargetByPlayerId: Record<string, string>;
  result: NonNullable<WolfPlayState["result"]>;
  cardMovementSummary: NonNullable<WolfPlayState["cardMovementSummary"]>;
  allPlayersSummary: NonNullable<WolfPlayState["allPlayersSummary"]>;
};

export const DEBUG_WOLF_RESULT_CASES: DebugWolfResultCase[] = [
  {
    "key": "doppelganger-robber",
    "label": "Nhân Bản → Kẻ Trộm",
    "note": "Yun nhân bản Kẻ Trộm rồi đổi bài với Trí. Lá Nhân Bản mang chức năng Kẻ Trộm sang Trí.",
    "roleDeck": [
      "doppelganger",
      "werewolf",
      "werewolf",
      "seer",
      "robber",
      "troublemaker",
      "insomniac",
      "villager"
    ],
    "myOriginalRole": "seer",
    "myFinalRole": "seer",
    "voteTargetByPlayerId": {
      "p1": "p3",
      "p2": "p3",
      "p3": "p5",
      "p4": "p3",
      "p5": "p1"
    },
    "result": {
      "eliminatedPlayerIds": [
        "p3"
      ],
      "winnerTeam": "werewolves",
      "winnerText": "Không có Ma Sói nào bị treo. Ma Sói thắng.",
      "skippedVoteCount": 0,
      "voteCounts": [
        {
          "playerId": "p1",
          "votes": 1
        },
        {
          "playerId": "p2",
          "votes": 0
        },
        {
          "playerId": "p3",
          "votes": 3
        },
        {
          "playerId": "p4",
          "votes": 0
        },
        {
          "playerId": "p5",
          "votes": 1
        }
      ]
    },
    "cardMovementSummary": {
      "orderText": "Log được xử lý theo thứ tự hành động trong đêm: 1. Copy Cat → 2. Nhân Bản → 3. Ma Sói → 4. Sói Tiên Tri → 5. Tiên Tri → 6. Kẻ Trộm → 7. Phù Thuỷ → 8. Say Rượu → 9. Kẻ Gây Rối → 10. Mất Ngủ. Copy Cat copy trước, rồi chức năng đã copy chạy ở đúng lượt của role đó.",
      "steps": [
        {
          "id": "doppelganger-p2-1",
          "title": "Bước 1: Yun hành động bằng vai ban đầu Nhân Bản",
          "logText": "Yun (Nhân Bản) nhân bản Đại Chúa (Kẻ Trộm)",
          "description": "Yun xem chức năng của Đại Chúa, trở thành Kẻ Trộm và thực hiện chức năng đó ngay trong lượt Nhân Bản."
        },
        {
          "id": "doppelganger-p2-2",
          "title": "Bước 2: Yun hành động bằng vai ban đầu Nhân Bản",
          "logText": "Yun (Nhân Bản → Kẻ Trộm) đổi bài với Trí (Ma Sói)",
          "description": "Yun nhân bản Kẻ Trộm và đổi bài với Trí."
        },
        {
          "id": "werewolf-p3-3",
          "title": "Bước 3: Trí hành động bằng vai ban đầu Ma Sói",
          "logText": "Trí (Ma Sói) xem lá giữa 1 (Ma Sói)",
          "description": "Trí là Ma Sói đơn nên được xem một lá giữa bàn. Hành động này không làm đổi vị trí lá bài."
        }
      ]
    },
    "allPlayersSummary": [
      {
        "playerId": "p1",
        "playerName": "Khánh",
        "originalRole": "seer",
        "finalRole": "seer",
        "finalTeamRole": "seer"
      },
      {
        "playerId": "p2",
        "playerName": "Yun",
        "originalRole": "doppelganger",
        "finalRole": "werewolf",
        "finalTeamRole": "werewolf"
      },
      {
        "playerId": "p3",
        "playerName": "Trí",
        "originalRole": "werewolf",
        "finalRole": "doppelganger",
        "finalTeamRole": "robber"
      },
      {
        "playerId": "p4",
        "playerName": "Lan Nè",
        "originalRole": "villager",
        "finalRole": "villager",
        "finalTeamRole": "villager"
      },
      {
        "playerId": "p5",
        "playerName": "Đại Chúa",
        "originalRole": "robber",
        "finalRole": "robber",
        "finalTeamRole": "robber"
      }
    ]
  },
  {
    "key": "doppelganger-wolf",
    "label": "Nhân Bản → Ma Sói",
    "note": "Yun nhân bản Ma Sói của Trí: cả hai thức dậy cùng nhau, lá Yun vẫn là Nhân Bản.",
    "roleDeck": [
      "doppelganger",
      "werewolf",
      "seer",
      "robber",
      "troublemaker",
      "insomniac",
      "villager",
      "villager"
    ],
    "myOriginalRole": "seer",
    "myFinalRole": "seer",
    "voteTargetByPlayerId": {
      "p1": "p3",
      "p2": "p1",
      "p3": "p1",
      "p4": "p3",
      "p5": "p3"
    },
    "result": {
      "eliminatedPlayerIds": [
        "p3"
      ],
      "winnerTeam": "villagers",
      "winnerText": "Có Ma Sói bị treo. Dân làng thắng.",
      "skippedVoteCount": 0,
      "voteCounts": [
        {
          "playerId": "p1",
          "votes": 2
        },
        {
          "playerId": "p2",
          "votes": 0
        },
        {
          "playerId": "p3",
          "votes": 3
        },
        {
          "playerId": "p4",
          "votes": 0
        },
        {
          "playerId": "p5",
          "votes": 0
        }
      ]
    },
    "cardMovementSummary": {
      "orderText": "Log được xử lý theo thứ tự hành động trong đêm: 1. Copy Cat → 2. Nhân Bản → 3. Ma Sói → 4. Sói Tiên Tri → 5. Tiên Tri → 6. Kẻ Trộm → 7. Phù Thuỷ → 8. Say Rượu → 9. Kẻ Gây Rối → 10. Mất Ngủ. Copy Cat copy trước, rồi chức năng đã copy chạy ở đúng lượt của role đó.",
      "steps": [
        {
          "id": "doppelganger-p2-1",
          "title": "Bước 1: Yun hành động bằng vai ban đầu Nhân Bản",
          "logText": "Yun (Nhân Bản) nhân bản Trí (Ma Sói)",
          "description": "Yun xem chức năng của Trí, trở thành Ma Sói và thực hiện chức năng đó ngay trong lượt Nhân Bản."
        },
        {
          "id": "doppelganger-p2-2",
          "title": "Bước 2: Yun hành động bằng vai ban đầu Nhân Bản",
          "logText": "Yun (Nhân Bản → Ma Sói) thấy Ma Sói cùng phe: Trí",
          "description": "Yun nhân bản Ma Sói nên thức dậy cùng bầy sói và biết đồng đội của mình."
        },
        {
          "id": "werewolf-p3-3",
          "title": "Bước 3: Trí hành động bằng vai ban đầu Ma Sói",
          "logText": "Trí (Ma Sói) thấy Ma Sói cùng phe: Yun",
          "description": "Trí có đồng đội Ma Sói nên không xem lá giữa bàn trong lượt này."
        }
      ]
    },
    "allPlayersSummary": [
      {
        "playerId": "p1",
        "playerName": "Khánh",
        "originalRole": "seer",
        "finalRole": "seer",
        "finalTeamRole": "seer"
      },
      {
        "playerId": "p2",
        "playerName": "Yun",
        "originalRole": "doppelganger",
        "finalRole": "doppelganger",
        "finalTeamRole": "werewolf"
      },
      {
        "playerId": "p3",
        "playerName": "Trí",
        "originalRole": "werewolf",
        "finalRole": "werewolf",
        "finalTeamRole": "werewolf"
      },
      {
        "playerId": "p4",
        "playerName": "Lan Nè",
        "originalRole": "villager",
        "finalRole": "villager",
        "finalTeamRole": "villager"
      },
      {
        "playerId": "p5",
        "playerName": "Đại Chúa",
        "originalRole": "villager",
        "finalRole": "villager",
        "finalTeamRole": "villager"
      }
    ]
  },
  {
    "key": "copycat-wolf",
    "label": "Copy Cat → Ma Sói",
    "note": "Yun copy lá Ma Sói giữa bàn, sau đó Đại Chúa (Kẻ Gây Rối) đẩy lá Copy Cat sang Lan Nè.",
    "roleDeck": [
      "copycat",
      "werewolf",
      "seer",
      "troublemaker",
      "insomniac",
      "villager",
      "villager",
      "villager"
    ],
    "myOriginalRole": "seer",
    "myFinalRole": "seer",
    "voteTargetByPlayerId": {
      "p1": "p4",
      "p2": "p4",
      "p3": "p4",
      "p4": "p2",
      "p5": "p2"
    },
    "result": {
      "eliminatedPlayerIds": [
        "p4"
      ],
      "winnerTeam": "villagers",
      "winnerText": "Có Ma Sói bị treo. Dân làng thắng.",
      "skippedVoteCount": 0,
      "voteCounts": [
        {
          "playerId": "p1",
          "votes": 0
        },
        {
          "playerId": "p2",
          "votes": 2
        },
        {
          "playerId": "p3",
          "votes": 0
        },
        {
          "playerId": "p4",
          "votes": 3
        },
        {
          "playerId": "p5",
          "votes": 0
        }
      ]
    },
    "cardMovementSummary": {
      "orderText": "Log được xử lý theo thứ tự hành động trong đêm: 1. Copy Cat → 2. Nhân Bản → 3. Ma Sói → 4. Sói Tiên Tri → 5. Tiên Tri → 6. Kẻ Trộm → 7. Phù Thuỷ → 8. Say Rượu → 9. Kẻ Gây Rối → 10. Mất Ngủ. Copy Cat copy trước, rồi chức năng đã copy chạy ở đúng lượt của role đó.",
      "steps": [
        {
          "id": "copycat-p2-1",
          "title": "Bước 1: Yun hành động bằng vai ban đầu Copy Cat",
          "logText": "Yun (Copy Cat) copy Ma Sói từ lá giữa 1",
          "description": "Yun chọn lá giữa 1, nhận chức năng Ma Sói, rồi thực hiện chức năng đó theo đúng lượt trong đêm."
        },
        {
          "id": "werewolf-p2-2",
          "title": "Bước 2: Yun thực hiện Ma Sói",
          "logText": "Yun (Copy Cat → Ma Sói) hoàn tất lượt mà không xem lá giữa bàn",
          "description": "Yun không chọn xem lá giữa bàn trong lượt Ma Sói. Hành động này không làm đổi vị trí lá bài."
        },
        {
          "id": "troublemaker-p5-3",
          "title": "Bước 3: Đại Chúa hành động bằng vai ban đầu Kẻ Gây Rối",
          "logText": "Đại Chúa (Kẻ Gây Rối) đổi bài của Yun (Copy Cat) với Lan Nè (Dân Làng)",
          "description": "Ở thời điểm Đại Chúa hành động, Yun đang giữ lá Copy Cat và Lan Nè đang giữ lá Dân Làng. Đại Chúa đổi chỗ hai lá này: lá Copy Cat chuyển sang Lan Nè, còn lá Dân Làng chuyển sang Yun."
        }
      ]
    },
    "allPlayersSummary": [
      {
        "playerId": "p1",
        "playerName": "Khánh",
        "originalRole": "seer",
        "finalRole": "seer",
        "finalTeamRole": "seer"
      },
      {
        "playerId": "p2",
        "playerName": "Yun",
        "originalRole": "copycat",
        "finalRole": "villager",
        "finalTeamRole": "villager"
      },
      {
        "playerId": "p3",
        "playerName": "Trí",
        "originalRole": "villager",
        "finalRole": "villager",
        "finalTeamRole": "villager"
      },
      {
        "playerId": "p4",
        "playerName": "Lan Nè",
        "originalRole": "villager",
        "finalRole": "copycat",
        "finalTeamRole": "werewolf"
      },
      {
        "playerId": "p5",
        "playerName": "Đại Chúa",
        "originalRole": "troublemaker",
        "finalRole": "troublemaker",
        "finalTeamRole": "troublemaker"
      }
    ]
  },
  {
    "key": "copycat-witch-chain",
    "label": "Copy Cat bị đẩy ra giữa bàn",
    "note": "Yun copy Ma Sói; Trí nhân bản Phù Thuỷ đẩy lá Copy Cat ra giữa; Lan Nè (Phù Thuỷ thật) đưa lá đó cho Đại Chúa.",
    "roleDeck": [
      "copycat",
      "doppelganger",
      "werewolf",
      "seer",
      "witch",
      "insomniac",
      "villager",
      "villager"
    ],
    "myOriginalRole": "seer",
    "myFinalRole": "seer",
    "voteTargetByPlayerId": {
      "p1": "p5",
      "p2": "p5",
      "p3": "p5",
      "p4": "p2",
      "p5": "p2"
    },
    "result": {
      "eliminatedPlayerIds": [
        "p5"
      ],
      "winnerTeam": "villagers",
      "winnerText": "Có Ma Sói bị treo. Dân làng thắng.",
      "skippedVoteCount": 0,
      "voteCounts": [
        {
          "playerId": "p1",
          "votes": 0
        },
        {
          "playerId": "p2",
          "votes": 2
        },
        {
          "playerId": "p3",
          "votes": 0
        },
        {
          "playerId": "p4",
          "votes": 0
        },
        {
          "playerId": "p5",
          "votes": 3
        }
      ]
    },
    "cardMovementSummary": {
      "orderText": "Log được xử lý theo thứ tự hành động trong đêm: 1. Copy Cat → 2. Nhân Bản → 3. Ma Sói → 4. Sói Tiên Tri → 5. Tiên Tri → 6. Kẻ Trộm → 7. Phù Thuỷ → 8. Say Rượu → 9. Kẻ Gây Rối → 10. Mất Ngủ. Copy Cat copy trước, rồi chức năng đã copy chạy ở đúng lượt của role đó.",
      "steps": [
        {
          "id": "copycat-p2-1",
          "title": "Bước 1: Yun hành động bằng vai ban đầu Copy Cat",
          "logText": "Yun (Copy Cat) copy Ma Sói từ lá giữa 1",
          "description": "Yun chọn lá giữa 1, nhận chức năng Ma Sói, rồi thực hiện chức năng đó theo đúng lượt trong đêm."
        },
        {
          "id": "doppelganger-p3-2",
          "title": "Bước 2: Trí hành động bằng vai ban đầu Nhân Bản",
          "logText": "Trí (Nhân Bản) nhân bản Lan Nè (Phù Thuỷ)",
          "description": "Trí xem chức năng của Lan Nè, trở thành Phù Thuỷ và thực hiện chức năng đó ngay trong lượt Nhân Bản."
        },
        {
          "id": "doppelganger-p3-3",
          "title": "Bước 3: Trí hành động bằng vai ban đầu Nhân Bản",
          "logText": "Trí (Nhân Bản → Phù Thuỷ) đổi lá giữa 2 (Dân Làng) với Yun (Copy Cat)",
          "description": "Trí nhân bản Phù Thuỷ, mở lá giữa 2 rồi đổi lá đó với Yun. Sau khi đổi, Yun nhận Dân Làng, còn lá giữa 2 nhận Copy Cat."
        },
        {
          "id": "werewolf-p2-4",
          "title": "Bước 4: Yun thực hiện Ma Sói",
          "logText": "Yun (Copy Cat → Ma Sói) hoàn tất lượt mà không xem lá giữa bàn",
          "description": "Yun không chọn xem lá giữa bàn trong lượt Ma Sói. Hành động này không làm đổi vị trí lá bài."
        },
        {
          "id": "witch-p4-5",
          "title": "Bước 5: Lan Nè hành động bằng vai ban đầu Phù Thuỷ",
          "logText": "Lan Nè (Phù Thuỷ) đổi lá giữa 2 (Copy Cat) với Đại Chúa (Dân Làng)",
          "description": "Lan Nè mở lá giữa 2 rồi đổi lá đó với Đại Chúa. Sau khi đổi, Đại Chúa nhận Copy Cat, còn lá giữa 2 nhận Dân Làng."
        }
      ]
    },
    "allPlayersSummary": [
      {
        "playerId": "p1",
        "playerName": "Khánh",
        "originalRole": "seer",
        "finalRole": "seer",
        "finalTeamRole": "seer"
      },
      {
        "playerId": "p2",
        "playerName": "Yun",
        "originalRole": "copycat",
        "finalRole": "villager",
        "finalTeamRole": "villager"
      },
      {
        "playerId": "p3",
        "playerName": "Trí",
        "originalRole": "doppelganger",
        "finalRole": "doppelganger",
        "finalTeamRole": "witch"
      },
      {
        "playerId": "p4",
        "playerName": "Lan Nè",
        "originalRole": "witch",
        "finalRole": "witch",
        "finalTeamRole": "witch"
      },
      {
        "playerId": "p5",
        "playerName": "Đại Chúa",
        "originalRole": "villager",
        "finalRole": "copycat",
        "finalTeamRole": "werewolf"
      }
    ]
  },
  {
    "key": "doppelganger-copycat",
    "label": "Nhân Bản → Copy Cat",
    "note": "Trí nhân bản trúng Copy Cat: chỉ ghi nhận vào log, không nhận chức năng nào.",
    "roleDeck": [
      "copycat",
      "doppelganger",
      "werewolf",
      "seer",
      "witch",
      "insomniac",
      "villager",
      "villager"
    ],
    "myOriginalRole": "seer",
    "myFinalRole": "seer",
    "voteTargetByPlayerId": {
      "p1": "p2",
      "p2": "p1",
      "p3": "p2",
      "p4": "p2",
      "p5": "p1"
    },
    "result": {
      "eliminatedPlayerIds": [
        "p2"
      ],
      "winnerTeam": "villagers",
      "winnerText": "Có Ma Sói bị treo. Dân làng thắng.",
      "skippedVoteCount": 0,
      "voteCounts": [
        {
          "playerId": "p1",
          "votes": 2
        },
        {
          "playerId": "p2",
          "votes": 3
        },
        {
          "playerId": "p3",
          "votes": 0
        },
        {
          "playerId": "p4",
          "votes": 0
        },
        {
          "playerId": "p5",
          "votes": 0
        }
      ]
    },
    "cardMovementSummary": {
      "orderText": "Log được xử lý theo thứ tự hành động trong đêm: 1. Copy Cat → 2. Nhân Bản → 3. Ma Sói → 4. Sói Tiên Tri → 5. Tiên Tri → 6. Kẻ Trộm → 7. Phù Thuỷ → 8. Say Rượu → 9. Kẻ Gây Rối → 10. Mất Ngủ. Copy Cat copy trước, rồi chức năng đã copy chạy ở đúng lượt của role đó.",
      "steps": [
        {
          "id": "copycat-p2-1",
          "title": "Bước 1: Yun hành động bằng vai ban đầu Copy Cat",
          "logText": "Yun (Copy Cat) copy Ma Sói từ lá giữa 1",
          "description": "Yun chọn lá giữa 1, nhận chức năng Ma Sói, rồi thực hiện chức năng đó theo đúng lượt trong đêm."
        },
        {
          "id": "doppelganger-p3-2",
          "title": "Bước 2: Trí hành động bằng vai ban đầu Nhân Bản",
          "logText": "Trí (Nhân Bản) nhân bản Yun (Copy Cat)",
          "description": "Trí xem chức năng của Yun, trở thành Copy Cat và thực hiện chức năng đó ngay trong lượt Nhân Bản."
        },
        {
          "id": "werewolf-p2-3",
          "title": "Bước 3: Yun thực hiện Ma Sói",
          "logText": "Yun (Copy Cat → Ma Sói) hoàn tất lượt mà không xem lá giữa bàn",
          "description": "Yun không chọn xem lá giữa bàn trong lượt Ma Sói. Hành động này không làm đổi vị trí lá bài."
        }
      ]
    },
    "allPlayersSummary": [
      {
        "playerId": "p1",
        "playerName": "Khánh",
        "originalRole": "seer",
        "finalRole": "seer",
        "finalTeamRole": "seer"
      },
      {
        "playerId": "p2",
        "playerName": "Yun",
        "originalRole": "copycat",
        "finalRole": "copycat",
        "finalTeamRole": "werewolf"
      },
      {
        "playerId": "p3",
        "playerName": "Trí",
        "originalRole": "doppelganger",
        "finalRole": "doppelganger",
        "finalTeamRole": "copycat"
      },
      {
        "playerId": "p4",
        "playerName": "Lan Nè",
        "originalRole": "witch",
        "finalRole": "witch",
        "finalTeamRole": "witch"
      },
      {
        "playerId": "p5",
        "playerName": "Đại Chúa",
        "originalRole": "villager",
        "finalRole": "villager",
        "finalTeamRole": "villager"
      }
    ]
  },
  {
    "key": "copycat-doppelganger-wolf",
    "label": "Copy Cat → Nhân Bản → Ma Sói",
    "note": "Yun copy lá Nhân Bản giữa bàn, rồi dùng nó nhân bản Ma Sói của Trí.",
    "roleDeck": [
      "copycat",
      "doppelganger",
      "werewolf",
      "seer",
      "insomniac",
      "villager",
      "villager",
      "villager"
    ],
    "myOriginalRole": "seer",
    "myFinalRole": "seer",
    "voteTargetByPlayerId": {
      "p1": "p3",
      "p2": "p1",
      "p3": "p1",
      "p4": "p3",
      "p5": "p3"
    },
    "result": {
      "eliminatedPlayerIds": [
        "p3"
      ],
      "winnerTeam": "villagers",
      "winnerText": "Có Ma Sói bị treo. Dân làng thắng.",
      "skippedVoteCount": 0,
      "voteCounts": [
        {
          "playerId": "p1",
          "votes": 2
        },
        {
          "playerId": "p2",
          "votes": 0
        },
        {
          "playerId": "p3",
          "votes": 3
        },
        {
          "playerId": "p4",
          "votes": 0
        },
        {
          "playerId": "p5",
          "votes": 0
        }
      ]
    },
    "cardMovementSummary": {
      "orderText": "Log được xử lý theo thứ tự hành động trong đêm: 1. Copy Cat → 2. Nhân Bản → 3. Ma Sói → 4. Sói Tiên Tri → 5. Tiên Tri → 6. Kẻ Trộm → 7. Phù Thuỷ → 8. Say Rượu → 9. Kẻ Gây Rối → 10. Mất Ngủ. Copy Cat copy trước, rồi chức năng đã copy chạy ở đúng lượt của role đó.",
      "steps": [
        {
          "id": "copycat-p2-1",
          "title": "Bước 1: Yun hành động bằng vai ban đầu Copy Cat",
          "logText": "Yun (Copy Cat) copy Nhân Bản từ lá giữa 1",
          "description": "Yun chọn lá giữa 1, nhận chức năng Nhân Bản, rồi thực hiện chức năng đó theo đúng lượt trong đêm."
        },
        {
          "id": "copycat-p2-doppelganger-2",
          "title": "Bước 2: Yun hành động bằng vai ban đầu Copy Cat",
          "logText": "Yun (Copy Cat → Nhân Bản) nhân bản Trí (Ma Sói)",
          "description": "Yun copy Nhân Bản, chọn Trí, rồi thực hiện chức năng như Nhân Bản bình thường."
        },
        {
          "id": "copycat-p2-doppelganger-3",
          "title": "Bước 3: Yun hành động bằng vai ban đầu Copy Cat",
          "logText": "Yun (Copy Cat → Nhân Bản → Ma Sói) thấy Ma Sói cùng phe: Trí",
          "description": "Yun copy Nhân Bản rồi nhân bản Ma Sói nên thức dậy cùng bầy sói."
        },
        {
          "id": "werewolf-p3-4",
          "title": "Bước 4: Trí hành động bằng vai ban đầu Ma Sói",
          "logText": "Trí (Ma Sói) thấy Ma Sói cùng phe: Yun",
          "description": "Trí có đồng đội Ma Sói nên không xem lá giữa bàn trong lượt này."
        }
      ]
    },
    "allPlayersSummary": [
      {
        "playerId": "p1",
        "playerName": "Khánh",
        "originalRole": "seer",
        "finalRole": "seer",
        "finalTeamRole": "seer"
      },
      {
        "playerId": "p2",
        "playerName": "Yun",
        "originalRole": "copycat",
        "finalRole": "copycat",
        "finalTeamRole": "werewolf"
      },
      {
        "playerId": "p3",
        "playerName": "Trí",
        "originalRole": "werewolf",
        "finalRole": "werewolf",
        "finalTeamRole": "werewolf"
      },
      {
        "playerId": "p4",
        "playerName": "Lan Nè",
        "originalRole": "villager",
        "finalRole": "villager",
        "finalTeamRole": "villager"
      },
      {
        "playerId": "p5",
        "playerName": "Đại Chúa",
        "originalRole": "villager",
        "finalRole": "villager",
        "finalTeamRole": "villager"
      }
    ]
  }
];

export const DEFAULT_DEBUG_WOLF_RESULT_CASE_KEY = "doppelganger-robber";

export function getDebugWolfResultCase(caseKey?: string): DebugWolfResultCase {
  return (
    DEBUG_WOLF_RESULT_CASES.find((resultCase) => resultCase.key === caseKey) ??
    DEBUG_WOLF_RESULT_CASES[0]
  );
}
