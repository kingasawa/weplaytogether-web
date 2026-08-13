"use client";

import {
  Check,
  Crown,
  Eye,
  History,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  ShieldX,
  Target,
  Users,
  Vote,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  AVALON_ROLE_LABELS,
  getAvalonQuestRequiredFails,
  getAvalonQuestTeamSize,
  type AvalonQuestCard,
  type AvalonTeamVote,
} from "@/lib/avalon-game";
import { getPlayerAvatarPath } from "@/lib/player-avatars";
import { useWolfRoomPresence } from "@/lib/pusher/use-wolf-room-presence";
import {
  confirmAvalonRoleReveal,
  finishAvalonGame,
  getAvalonPlayState,
  leaveAvalonRoom,
  proposeAvalonTeam,
  submitAvalonAssassination,
  submitAvalonLadyTarget,
  submitAvalonQuestCard,
  submitAvalonTeamVote,
  type AvalonPlayPlayer,
  type AvalonPlayState,
} from "../../../actions";
import styles from "../../../../wolf/page.module.css";

type AvalonPlayScreenProps = {
  initialState: AvalonPlayState;
};

type AvalonSelectionState = {
  key: string;
  teamPlayerIds: string[];
  questIndex: number;
  ladyTargetId: string | null;
  assassinationTargetId: string | null;
};

function getTeamLabel(team: AvalonPlayState["myLoyalty"]) {
  if (team === "good") {
    return "Good";
  }

  if (team === "evil") {
    return "Evil";
  }

  return "Không rõ";
}

function getPlayerName(players: AvalonPlayPlayer[], playerId: string | null) {
  return players.find((player) => player.id === playerId)?.name ?? "Không rõ";
}

export default function AvalonPlayScreen({ initialState }: AvalonPlayScreenProps) {
  const router = useRouter();
  const [playState, setPlayState] = useState(initialState);
  const [selectionState, setSelectionState] = useState<AvalonSelectionState>(() => ({
    key: "",
    teamPlayerIds: initialState.selectedTeamPlayerIds,
    questIndex:
      initialState.game.proposedQuestIndex ?? initialState.availableQuestIndexes[0] ?? initialState.game.questIndex,
    ladyTargetId: null,
    assassinationTargetId: null,
  }));
  const [message, setMessage] = useState("");
  const [pendingLabel, setPendingLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  const currentPlayer = playState.players.find((player) => player.id === playState.currentPlayerId) ?? null;
  const isLeader = Boolean(currentPlayer && playState.leaderPlayerId === currentPlayer.id);
  const isRoleRevealPhase = playState.game.phase === "role_reveal";
  const isTeamProposalPhase = playState.game.phase === "team_proposal";
  const isTeamVotePhase = playState.game.phase === "team_vote";
  const isQuestPhase = playState.game.phase === "quest";
  const isLadyPhase = playState.game.phase === "lady";
  const isAssassinationPhase = playState.game.phase === "assassination";
  const isResultPhase = playState.game.phase === "result";
  const selectionKey = `${playState.game.id}:${playState.game.phase}:${playState.game.proposalAttempt}:${
    playState.game.proposedQuestIndex ?? ""
  }:${playState.selectedTeamPlayerIds.join(",")}:${playState.availableQuestIndexes.join(",")}`;
  const selectedTeamPlayerIds =
    selectionState.key === selectionKey ? selectionState.teamPlayerIds : playState.selectedTeamPlayerIds;
  const selectedQuestIndex =
    selectionState.key === selectionKey
      ? selectionState.questIndex
      : playState.game.proposedQuestIndex ?? playState.availableQuestIndexes[0] ?? playState.game.questIndex;
  const selectedLadyTargetId = selectionState.key === selectionKey ? selectionState.ladyTargetId : null;
  const selectedAssassinationTargetId =
    selectionState.key === selectionKey ? selectionState.assassinationTargetId : null;
  const currentQuestIndex = playState.game.proposedQuestIndex ?? selectedQuestIndex ?? playState.game.questIndex;
  const currentQuestNumber = currentQuestIndex + 1;
  const currentQuestRequiredFails = getAvalonQuestRequiredFails(playState.players.length, currentQuestIndex);
  const teamSubmittedQuestCards = playState.players.filter(
    (player) => player.isOnQuestTeam && player.hasQuestSubmitted
  ).length;
  const knownEvilIds = new Set(
    playState.privateInfo.knownPlayers
      .filter((knownPlayer) => knownPlayer.loyalty === "evil" || knownPlayer.note.includes("Evil"))
      .map((knownPlayer) => knownPlayer.playerId)
  );
  const assassinCandidates = playState.players.filter(
    (player) => player.id !== playState.currentPlayerId && !knownEvilIds.has(player.id)
  );
  const ladyTargets = playState.players.filter(
    (player) =>
      player.id !== playState.currentPlayerId && !playState.ladyOfLake.usedByPlayerIds.includes(player.id)
  );

  const refreshPlayState = useCallback(async () => {
    const nextState = await getAvalonPlayState(playState.room.code);

    if (!nextState) {
      router.push(`/games/avalon/rooms/${playState.room.code}`);
      return;
    }

    setPlayState(nextState);
  }, [playState.room.code, router]);

  useWolfRoomPresence({
    enabled: Boolean(playState.currentPlayerId),
    roomCode: playState.room.code,
    onPlayUpdate: refreshPlayState,
    onRoomUpdate: refreshPlayState,
  });

  const questTrack = useMemo(
    () =>
      Array.from({ length: 5 }, (_, questIndex) => {
        const result = playState.questResults.find((questResult) => questResult.questIndex === questIndex);

        return {
          questIndex,
          result,
          teamSize: getAvalonQuestTeamSize(playState.players.length, questIndex),
          requiredFails: getAvalonQuestRequiredFails(playState.players.length, questIndex),
        };
      }),
    [playState.players.length, playState.questResults]
  );

  function runMutation(label: string, mutation: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setMessage("");
    setPendingLabel(label);
    startTransition(async () => {
      const result = await mutation();

      if (!result.ok) {
        setMessage(result.error);
        setPendingLabel("");
        return;
      }

      await refreshPlayState();
      setPendingLabel("");
    });
  }

  function toggleTeamPlayer(playerId: string) {
    if (!isLeader || !isTeamProposalPhase || isPending) {
      return;
    }

    setSelectionState((currentSelection) => {
      const currentIds =
        currentSelection.key === selectionKey ? currentSelection.teamPlayerIds : playState.selectedTeamPlayerIds;

      if (currentIds.includes(playerId)) {
        return {
          ...currentSelection,
          key: selectionKey,
          questIndex: selectedQuestIndex,
          teamPlayerIds: currentIds.filter((currentId) => currentId !== playerId),
        };
      }

      if (currentIds.length >= playState.requiredTeamSize) {
        return {
          ...currentSelection,
          key: selectionKey,
          questIndex: selectedQuestIndex,
          teamPlayerIds: currentIds,
        };
      }

      return {
        ...currentSelection,
        key: selectionKey,
        questIndex: selectedQuestIndex,
        teamPlayerIds: [...currentIds, playerId],
      };
    });
  }

  function proposeCurrentTeam() {
    if (selectedTeamPlayerIds.length !== playState.requiredTeamSize) {
      setMessage(`Quest ${currentQuestNumber} cần đúng ${playState.requiredTeamSize} người.`);
      return;
    }

    runMutation("Đang đề cử đội...", () =>
      proposeAvalonTeam(playState.room.code, {
        playerIds: selectedTeamPlayerIds,
        questIndex: selectedQuestIndex,
      })
    );
  }

  function voteTeam(vote: AvalonTeamVote) {
    runMutation("Đang gửi phiếu vote...", () => submitAvalonTeamVote(playState.room.code, vote));
  }

  function submitQuest(card: AvalonQuestCard) {
    runMutation("Đang gửi lá quest...", () => submitAvalonQuestCard(playState.room.code, card));
  }

  function submitLadyTarget() {
    if (!selectedLadyTargetId) {
      setMessage("Chọn một người để Lady of the Lake xem loyalty.");
      return;
    }

    runMutation("Đang dùng Lady of the Lake...", () =>
      submitAvalonLadyTarget(playState.room.code, selectedLadyTargetId)
    );
  }

  function submitAssassination() {
    if (!selectedAssassinationTargetId) {
      setMessage("Assassin cần chọn một mục tiêu.");
      return;
    }

    runMutation("Đang chốt mục tiêu Assassin...", () =>
      submitAvalonAssassination(playState.room.code, selectedAssassinationTargetId)
    );
  }

  function returnToLobby() {
    runMutation("Đang quay lại phòng chờ...", async () => {
      const result = await finishAvalonGame(playState.room.code);

      if (result.ok) {
        router.push(`/games/avalon/rooms/${playState.room.code}`);
      }

      return result;
    });
  }

  function exitGame() {
    runMutation("Đang thoát phòng...", async () => {
      const result = await leaveAvalonRoom(playState.room.code);

      if (result.ok) {
        router.push("/games/avalon");
      }

      return result;
    });
  }

  function renderQuestTrack() {
    return (
      <section className={styles.avalonQuestTrack} aria-label="Tiến độ quest">
        {questTrack.map(({ questIndex, result, teamSize, requiredFails }) => (
          <article
            className={`${styles.avalonQuestNode} ${
              result?.outcome === "success"
                ? styles.avalonQuestSuccess
                : result?.outcome === "fail"
                  ? styles.avalonQuestFail
                  : currentQuestIndex === questIndex && !isResultPhase
                    ? styles.avalonQuestCurrent
                    : ""
            }`}
            key={questIndex}
          >
            <strong>Q{questIndex + 1}</strong>
            <span>{teamSize} người</span>
            {requiredFails > 1 && <small>2 Fail</small>}
          </article>
        ))}
      </section>
    );
  }

  function renderPlayerButton(player: AvalonPlayPlayer, active: boolean, onClick: () => void, disabled = false) {
    return (
      <button
        className={`${styles.avalonPlayerButton} ${active ? styles.avalonPlayerButtonActive : ""}`}
        type="button"
        disabled={disabled || isPending}
        key={player.id}
        onClick={onClick}
      >
        <Image
          alt=""
          aria-hidden="true"
          className={styles.playerAvatar}
          width={44}
          height={44}
          src={getPlayerAvatarPath(player.avatarKey)}
        />
        <span>{player.name}</span>
        {active && <Check aria-hidden="true" />}
      </button>
    );
  }

  function renderPrivatePanel() {
    if (!currentPlayer) {
      return null;
    }

    return (
      <section className={styles.avalonPrivatePanel}>
        <div className={styles.avalonSectionTitle}>
          <Eye aria-hidden="true" />
          <span>Thông tin riêng</span>
        </div>
        <div className={styles.avalonRoleCard}>
          <span>Vai của bạn</span>
          <strong>{playState.myRole ? AVALON_ROLE_LABELS[playState.myRole] : "Chưa rõ"}</strong>
          <p>{getTeamLabel(playState.myLoyalty)}</p>
        </div>
        {playState.privateInfo.roleDescription && <p>{playState.privateInfo.roleDescription}</p>}
        {playState.privateInfo.knownPlayers.length > 0 && (
          <div className={styles.avalonInfoList}>
            {playState.privateInfo.knownPlayers.map((knownPlayer) => (
              <span key={`${knownPlayer.playerId}-${knownPlayer.note}`}>
                {knownPlayer.playerName}: {knownPlayer.note}
              </span>
            ))}
          </div>
        )}
        {playState.privateInfo.ladyInspections.length > 0 && (
          <div className={styles.avalonInfoList}>
            {playState.privateInfo.ladyInspections.map((inspection) => (
              <span key={`${inspection.questNumber}-${inspection.targetPlayerId}`}>
                Q{inspection.questNumber}: {inspection.targetName} là {getTeamLabel(inspection.loyalty)}
              </span>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderRoleReveal() {
    const hasConfirmed = Boolean(currentPlayer?.hasConfirmedRole);

    return (
      <section className={styles.playPanel}>
        <div className={styles.avalonPhaseHero}>
          <Crown aria-hidden="true" />
          <span>Vai bí mật</span>
          <h2>{playState.myRole ? AVALON_ROLE_LABELS[playState.myRole] : "Người quan sát"}</h2>
          <p>{playState.privateInfo.roleDescription ?? "Chờ người chơi trong phòng xác nhận đã xem vai."}</p>
        </div>
        {renderPrivatePanel()}
        {currentPlayer && (
          <button
            className={styles.primaryButton}
            type="button"
            disabled={isPending || hasConfirmed}
            onClick={() => runMutation("Đang xác nhận...", () => confirmAvalonRoleReveal(playState.room.code))}
          >
            <Check aria-hidden="true" />
            {hasConfirmed ? "Đã xác nhận" : "Tôi đã xem vai"}
          </button>
        )}
      </section>
    );
  }

  function renderTeamProposal() {
    return (
      <section className={styles.playPanel}>
        <div className={styles.avalonSectionTitle}>
          <Crown aria-hidden="true" />
          <span>Leader: {playState.leaderName}</span>
        </div>
        <div className={styles.avalonPhaseSummary}>
          <strong>Quest {currentQuestNumber}</strong>
          <span>
            Chọn {playState.requiredTeamSize} người. Lượt đề cử {playState.game.proposalAttempt}/5.
          </span>
        </div>

        {playState.options.targeting && playState.availableQuestIndexes.length > 1 && isLeader && (
          <div className={styles.avalonQuestPicker}>
            {playState.availableQuestIndexes.map((questIndex) => (
              <button
                className={selectedQuestIndex === questIndex ? styles.avalonQuestChoiceActive : ""}
                type="button"
                key={questIndex}
                disabled={isPending}
                onClick={() => {
                  setSelectionState({
                    key: selectionKey,
                    teamPlayerIds: [],
                    questIndex,
                    ladyTargetId: null,
                    assassinationTargetId: null,
                  });
                }}
              >
                Quest {questIndex + 1}
              </button>
            ))}
          </div>
        )}

        {isLeader ? (
          <>
            <div className={styles.avalonPlayerGrid}>
              {playState.players.map((player) =>
                renderPlayerButton(
                  player,
                  selectedTeamPlayerIds.includes(player.id),
                  () => toggleTeamPlayer(player.id)
                )
              )}
            </div>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={isPending || selectedTeamPlayerIds.length !== playState.requiredTeamSize}
              onClick={proposeCurrentTeam}
            >
              <Users aria-hidden="true" />
              Đề cử đội
            </button>
          </>
        ) : (
          <p className={styles.avalonWaitingText}>Đang chờ Leader chọn đội quest.</p>
        )}
      </section>
    );
  }

  function renderTeamVote() {
    return (
      <section className={styles.playPanel}>
        <div className={styles.avalonSectionTitle}>
          <Vote aria-hidden="true" />
          <span>Vote đội Quest {currentQuestNumber}</span>
        </div>
        <div className={styles.avalonSelectedTeam}>
          {playState.selectedTeamPlayerIds.map((playerId) => (
            <span key={playerId}>{getPlayerName(playState.players, playerId)}</span>
          ))}
        </div>
        {currentPlayer && !currentPlayer.hasTeamVoted && (
          <div className={styles.avalonVoteActions}>
            <button className={styles.secondaryButton} type="button" disabled={isPending} onClick={() => voteTeam("approve")}>
              <ShieldCheck aria-hidden="true" />
              Approve
            </button>
            <button className={styles.exitButton} type="button" disabled={isPending} onClick={() => voteTeam("reject")}>
              <ShieldX aria-hidden="true" />
              Reject
            </button>
          </div>
        )}
        {currentPlayer?.hasTeamVoted && !playState.isTeamVoteRevealed && (
          <p className={styles.avalonWaitingText}>Đã gửi phiếu. Chờ mọi người vote.</p>
        )}
        <div className={styles.avalonVoteReview}>
          <strong>
            Approve {playState.teamVoteCounts.approve} / Reject {playState.teamVoteCounts.reject}
          </strong>
          {playState.isTeamVoteRevealed && (
            <div className={styles.avalonInfoList}>
              {playState.players.map((player) => (
                <span key={player.id}>
                  {player.name}: {player.teamVote === "approve" ? "Approve" : "Reject"}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderQuest() {
    const canSubmitQuest = Boolean(currentPlayer?.isOnQuestTeam && !currentPlayer.hasQuestSubmitted);
    const canPlayFail = playState.myLoyalty === "evil";

    return (
      <section className={styles.playPanel}>
        <div className={styles.avalonSectionTitle}>
          <Target aria-hidden="true" />
          <span>Quest {currentQuestNumber}</span>
        </div>
        <div className={styles.avalonPhaseSummary}>
          <strong>{currentQuestRequiredFails} Fail để quest thất bại</strong>
          <span>
            {teamSubmittedQuestCards}/{playState.selectedTeamPlayerIds.length} lá đã được gửi.
          </span>
        </div>
        <div className={styles.avalonSelectedTeam}>
          {playState.selectedTeamPlayerIds.map((playerId) => (
            <span key={playerId}>{getPlayerName(playState.players, playerId)}</span>
          ))}
        </div>
        {canSubmitQuest ? (
          <div className={styles.avalonVoteActions}>
            <button className={styles.secondaryButton} type="button" disabled={isPending} onClick={() => submitQuest("success")}>
              <Check aria-hidden="true" />
              Success
            </button>
            <button
              className={styles.exitButton}
              type="button"
              disabled={isPending || !canPlayFail}
              onClick={() => submitQuest("fail")}
            >
              <X aria-hidden="true" />
              Fail
            </button>
          </div>
        ) : (
          <p className={styles.avalonWaitingText}>
            {currentPlayer?.isOnQuestTeam ? "Bạn đã gửi lá quest." : "Chờ đội quest chọn Success hoặc Fail."}
          </p>
        )}
      </section>
    );
  }

  function renderLady() {
    const isHolder = currentPlayer?.id === playState.ladyOfLake.holderPlayerId;

    return (
      <section className={styles.playPanel}>
        <div className={styles.avalonSectionTitle}>
          <Eye aria-hidden="true" />
          <span>Lady of the Lake</span>
        </div>
        <p className={styles.avalonWaitingText}>
          Người giữ token: {playState.ladyOfLake.holderName}. Lady xem loyalty, sau đó token chuyển cho người bị xem.
        </p>
        {isHolder ? (
          <>
            <div className={styles.avalonPlayerGrid}>
              {ladyTargets.map((player) =>
                renderPlayerButton(
                  player,
                  selectedLadyTargetId === player.id,
                  () =>
                    setSelectionState((currentSelection) => ({
                      ...currentSelection,
                      key: selectionKey,
                      questIndex: selectedQuestIndex,
                      teamPlayerIds: selectedTeamPlayerIds,
                      ladyTargetId: player.id,
                    }))
                )
              )}
            </div>
            <button className={styles.primaryButton} type="button" disabled={isPending || !selectedLadyTargetId} onClick={submitLadyTarget}>
              <Eye aria-hidden="true" />
              Xem loyalty
            </button>
          </>
        ) : (
          <p className={styles.avalonWaitingText}>Đang chờ Lady chọn mục tiêu.</p>
        )}
      </section>
    );
  }

  function renderAssassination() {
    const isAssassin = playState.myRole === "assassin";

    return (
      <section className={styles.playPanel}>
        <div className={styles.avalonSectionTitle}>
          <Target aria-hidden="true" />
          <span>Assassin đoán Merlin</span>
        </div>
        <p className={styles.avalonWaitingText}>
          Good đã hoàn thành 3 quest. Evil có một cơ hội cuối để đoán Merlin.
        </p>
        {isAssassin ? (
          <>
            <div className={styles.avalonPlayerGrid}>
              {assassinCandidates.map((player) =>
                renderPlayerButton(
                  player,
                  selectedAssassinationTargetId === player.id,
                  () =>
                    setSelectionState((currentSelection) => ({
                      ...currentSelection,
                      key: selectionKey,
                      questIndex: selectedQuestIndex,
                      teamPlayerIds: selectedTeamPlayerIds,
                      assassinationTargetId: player.id,
                    }))
                )
              )}
            </div>
            <button
              className={styles.exitButton}
              type="button"
              disabled={isPending || !selectedAssassinationTargetId}
              onClick={submitAssassination}
            >
              <Target aria-hidden="true" />
              Chốt mục tiêu
            </button>
          </>
        ) : (
          <p className={styles.avalonWaitingText}>Đang chờ Assassin chốt mục tiêu Merlin.</p>
        )}
      </section>
    );
  }

  function renderResult() {
    return (
      <section className={styles.playPanel}>
        {playState.result && (
          <strong
            className={`${styles.resultBanner} ${
              playState.result.winnerTeam === "evil" ? styles.resultBannerDanger : ""
            }`}
          >
            {playState.result.winnerText}
          </strong>
        )}
        {playState.result && <p className={styles.avalonWaitingText}>{playState.result.winnerReason}</p>}

        <div className={styles.resultSummaryList}>
          {playState.players.map((player) => (
            <div className={styles.resultSummaryRow} key={player.id}>
              <div className={styles.resultSummaryHeader}>
                <strong>{player.name}</strong>
                <span className={player.loyalty === "evil" ? styles.resultRoleTag : undefined}>
                  {getTeamLabel(player.loyalty)}
                </span>
              </div>
              <div className={styles.resultRoleChange}>
                <span>
                  Vai
                  <strong>{player.role ? AVALON_ROLE_LABELS[player.role] : "Không rõ"}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>

        {playState.assassination.targetPlayerId && (
          <div className={styles.avalonVoteReview}>
            <strong>Assassin chọn {getPlayerName(playState.players, playState.assassination.targetPlayerId)}</strong>
            <span>{playState.assassination.guessedCorrect ? "Đoán đúng Merlin" : "Đoán sai Merlin"}</span>
          </div>
        )}
      </section>
    );
  }

  function renderPhasePanel() {
    if (isRoleRevealPhase) {
      return renderRoleReveal();
    }

    if (isTeamProposalPhase) {
      return renderTeamProposal();
    }

    if (isTeamVotePhase) {
      return renderTeamVote();
    }

    if (isQuestPhase) {
      return renderQuest();
    }

    if (isLadyPhase) {
      return renderLady();
    }

    if (isAssassinationPhase) {
      return renderAssassination();
    }

    return renderResult();
  }

  return (
    <main className={`${styles.page} ${styles.playPage} ${styles.avalonTheme}`}>
      <section className={`${styles.playHeader} ${isResultPhase ? styles.resultHeader : ""}`}>
        <div>
          <span>Phòng {playState.room.code.toUpperCase()}</span>
          <h1>{playState.game.phaseLabel}</h1>
        </div>
        <p>
          Good {playState.successCount}/3 · Evil {playState.failCount}/3 · Leader {playState.leaderName}
        </p>
      </section>

      {renderQuestTrack()}

      <section className={styles.avalonBoardLayout}>
        <div className={styles.avalonMainColumn}>
          {renderPhasePanel()}

          {message && <p className={styles.inlineError}>{message}</p>}

          {playState.questResults.length > 0 && (
            <section className={styles.avalonHistoryPanel}>
              <div className={styles.avalonSectionTitle}>
                <History aria-hidden="true" />
                <span>Lịch sử quest</span>
              </div>
              <div className={styles.avalonInfoList}>
                {playState.questResults.map((questResult) => (
                  <span key={`${questResult.questIndex}-${questResult.proposalAttempt}`}>
                    Q{questResult.questNumber}: {questResult.outcome === "success" ? "Success" : "Fail"} ·{" "}
                    {questResult.failCount} Fail · Đội {questResult.teamNames.join(", ")}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className={styles.avalonSideColumn}>
          {renderPrivatePanel()}
          <section className={styles.avalonPrivatePanel}>
            <div className={styles.avalonSectionTitle}>
              <Users aria-hidden="true" />
              <span>Người chơi</span>
            </div>
            <div className={styles.avalonInfoList}>
              {playState.players.map((player) => (
                <span key={player.id}>
                  {player.name}
                  {player.id === playState.leaderPlayerId ? " · Leader" : ""}
                  {player.isOnQuestTeam ? " · Team" : ""}
                </span>
              ))}
            </div>
          </section>
          <section className={styles.avalonPrivatePanel}>
            <div className={styles.avalonSectionTitle}>
              <Crown aria-hidden="true" />
              <span>Role deck</span>
            </div>
            <div className={styles.avalonInfoList}>
              {playState.roleDeckSummary.map((summary) => (
                <span key={summary.role}>
                  {AVALON_ROLE_LABELS[summary.role]} x{summary.count}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </section>

      {isResultPhase && (
        <section className={styles.resultActionBar}>
          {playState.isCurrentPlayerHost && (
            <button className={styles.primaryButton} type="button" disabled={isPending} onClick={returnToLobby}>
              <Check aria-hidden="true" />
              Quay lại phòng chờ
            </button>
          )}
          <button className={styles.exitButton} type="button" disabled={isPending} onClick={exitGame}>
            <LogOut aria-hidden="true" />
            Thoát
          </button>
        </section>
      )}

      {isPending && (
        <div className={styles.playLoading} aria-live="polite">
          <LoaderCircle aria-hidden="true" />
          <span>{pendingLabel || "Đang xử lý..."}</span>
        </div>
      )}
    </main>
  );
}
