'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '../../../lib/socket';
import { loadSession, clearSession, type AnonSession } from '../../../lib/session';
import { Avatar, type AvatarState } from '../../../components/Avatar';
import { PlayerGrid, PlayerCard } from '../../../components/PlayerGrid';
import { Rules } from '../../../components/Rules';
import { RoleRevealCard } from '../../../components/RoleRevealCard';
import { EliminationOverlay, type EliminationInfo } from '../../../components/EliminationOverlay';
import { WinScreen } from '../../../components/WinScreen';
import { PhaseTransitionBanner } from '../../../components/PhaseTransitionBanner';
import { ROLE_COLORS, ROLE_EMOJI } from '../../../lib/roleTheme';
import type { GameEvent, PlayerView, Room } from '@mafia/shared';

const ACTING_ROLES = new Set(['mafia', 'doctor', 'detective']);

const PHASE_LABELS: Record<string, string> = {
  role_assign: 'Assigning Roles',
  night: 'Night',
  night_resolution: 'Night Results',
  day_discussion: 'Day — Discussion',
  day_voting: 'Day — Voting',
  elimination: 'Elimination',
  game_over: 'Game Over',
};

// Mood shifts with the phase — dark and cold at night, warm through the day.
const PHASE_BACKGROUND: Record<string, string> = {
  night: 'from-slate-950 via-indigo-950 to-slate-950',
  night_resolution: 'from-slate-950 via-rose-950 to-slate-950',
  day_discussion: 'from-slate-950 via-amber-950 to-slate-950',
  day_voting: 'from-slate-950 via-orange-950 to-slate-950',
  elimination: 'from-slate-950 via-rose-950 to-slate-950',
  game_over: 'from-slate-950 via-purple-950 to-slate-950',
};

function formatRemaining(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Buckets the timeline by GameEvent.dayNumber, oldest round first, in original order within a round. */
function groupEventsByDay(events: GameEvent[]): Array<[number, GameEvent[]]> {
  const groups = new Map<number, GameEvent[]>();
  for (const e of events) {
    const list = groups.get(e.dayNumber) ?? [];
    list.push(e);
    groups.set(e.dayNumber, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b);
}

function describeEvent(event: GameEvent, nameById: Map<string, string>): string {
  if (event.type === 'death') {
    const name = nameById.get(event.payload.targetId as string) ?? 'Someone';
    return event.payload.cause === 'mafia' ? `${name} was killed during the night.` : `${name} was voted out.`;
  }
  if (event.type === 'last_words') {
    const name = nameById.get(event.payload.actorId as string) ?? 'Someone';
    return `💬 ${name}: "${event.payload.text}"`;
  }
  if (event.type === 'kicked') {
    const name = nameById.get(event.payload.actorId as string) ?? 'Someone';
    return `${name} was removed by the host.`;
  }
  if (event.type === 'system') return String(event.payload.message ?? '');
  return '';
}

/** What a player should be doing right now, phase by phase. */
function roleInstructions(phase: string, role: string, isAlive: boolean): string | null {
  if (!isAlive) return null;
  if (phase === 'night') {
    if (role === 'mafia') return 'Choose a player to eliminate. Coordinate with your fellow Mafia below.';
    if (role === 'doctor') return "Choose a player to protect from tonight's Mafia attack — you may protect yourself.";
    if (role === 'detective') return "Choose a player to investigate — you'll learn whether they're Mafia.";
    return 'You have no night action. Sit tight until morning.';
  }
  if (phase === 'day_discussion') return 'Discuss with the group who you suspect is Mafia. Voting opens next.';
  if (phase === 'day_voting') return 'Vote for who you think is Mafia. Whoever gets the most votes is eliminated.';
  return null;
}

/** Doctor protects, Detective investigates, Mafia targets — the button text should say so. */
function nightActionLabel(role: string, selected: boolean): string {
  const verb = role === 'doctor' ? 'Protect' : role === 'detective' ? 'Investigate' : 'Target';
  if (!selected) return verb;
  return verb === 'Protect' ? '✓ Protected' : verb === 'Investigate' ? '✓ Investigated' : '✓ Targeted';
}

const inputClass =
  'min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500';
const primaryButtonClass =
  'shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50';
const ghostButtonClass =
  'rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800';
const dangerGhostButtonClass =
  'rounded-md border border-rose-900/60 px-2 py-1 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-950/50';
const actionButtonClass =
  'rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-500';
const selectedActionButtonClass =
  'cursor-default rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white opacity-90';
const panelClass = 'rounded-lg border border-slate-800 bg-slate-900/60 p-4';

export default function RoomPage() {
  const params = useParams<{ roomCode: string }>();
  const router = useRouter();
  const [session, setSession] = useState<AnonSession | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [chat, setChat] = useState<Array<{ userId: string; displayName: string; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [mafiaChat, setMafiaChat] = useState<Array<{ userId: string; displayName: string; text: string }>>([]);
  const [mafiaChatInput, setMafiaChatInput] = useState('');
  const [mafiaTargets, setMafiaTargets] = useState<
    Array<{ actorId: string; actorDisplayName: string; targetId: string; targetDisplayName: string }>
  >([]);
  const [lastWordsInput, setLastWordsInput] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const mafiaChatScrollRef = useRef<HTMLDivElement>(null);

  // --- Presentation-layer state: role reveal, elimination reveal, phase transitions, win screen ---
  const [showRoleCard, setShowRoleCard] = useState(false);
  const hasShownRoleCardRef = useRef(false);
  const [eliminationInfo, setEliminationInfo] = useState<EliminationInfo | null>(null);
  const prevEventCountRef = useRef<number | null>(null);
  const eliminationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [transitionText, setTransitionText] = useState<string | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const [winScreenDismissed, setWinScreenDismissed] = useState(false);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  useEffect(() => {
    const el = mafiaChatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mafiaChat]);

  useEffect(() => {
    const s = loadSession();
    if (!s || s.roomCode !== params.roomCode) {
      router.replace('/');
      return;
    }
    setSession(s);

    const socket = getSocket();
    const handleRoomUpdated = (r: Room) => {
      setRoom(r);
      // The host restarted — the game instance is gone server-side, so drop any state
      // that belonged to the previous game instead of leaving it stale on screen.
      if (r.status === 'lobby') {
        setView(null);
        setMafiaTargets([]);
        hasShownRoleCardRef.current = false;
        setShowRoleCard(false);
        setEliminationInfo(null);
        setTransitionText(null);
        setWinScreenDismissed(false);
        prevEventCountRef.current = null;
        prevPhaseRef.current = null;
      }
    };
    socket.on('room:updated', handleRoomUpdated);
    socket.on('game:view', setView);
    socket.on('room:kicked', () => {
      clearSession();
      router.replace('/');
    });
    socket.on('error', (payload) => setError(payload.message));
    socket.on('connect_error', (err) => setError(`Can't reach the game server (${err.message}).`));

    // Fetch current state — on the initial mount, and again on every (re)connect. A phone
    // locking its screen kills the underlying connection; socket.io auto-reconnects, but
    // without this we'd clear neither the stale error message nor any state we missed while
    // disconnected (a phase change, a death, chat) — the page would just look frozen/wrong.
    const syncRoom = () => {
      socket.emit('room:sync', { roomCode: s.roomCode, userId: s.userId }, (res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setError(null);
        setRoom(res.room);
        if (res.view) setView(res.view);
      });
    };
    socket.on('connect', syncRoom);
    syncRoom();

    socket.on('chat:message', (msg) =>
      setChat((prev) => [...prev, { userId: msg.fromUserId, displayName: msg.displayName, text: msg.text }])
    );
    socket.on('mafia:chat', (msg) =>
      setMafiaChat((prev) => [...prev, { userId: msg.fromUserId, displayName: msg.displayName, text: msg.text }])
    );
    socket.on('game:mafiaNightStatus', (status) => setMafiaTargets(status.targets));

    return () => {
      socket.off('connect', syncRoom);
      socket.off('room:updated', handleRoomUpdated);
      socket.off('game:view', setView);
      socket.off('room:kicked');
      socket.off('error');
      socket.off('connect_error');
      socket.off('chat:message');
      socket.off('mafia:chat');
      socket.off('game:mafiaNightStatus');
    };
  }, [params.roomCode, router]);

  useEffect(() => {
    if (!view?.phaseEndsAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [view?.phaseEndsAt]);

  // A fresh phase means a fresh decision — clear any highlighted pick from the last one.
  useEffect(() => {
    setSelectedTargetId(null);
  }, [view?.phase]);

  // Show the role card exactly once per game — the first time this browser sees a view.
  useEffect(() => {
    if (view && !hasShownRoleCardRef.current) {
      hasShownRoleCardRef.current = true;
      setShowRoleCard(true);
    }
  }, [view]);

  // Detect a newly-arrived death/kicked event and show the elimination reveal for it. Baselines
  // on the first view seen (mount/reconnect) so we don't retroactively replay old eliminations.
  useEffect(() => {
    if (!view) {
      prevEventCountRef.current = null;
      return;
    }
    const events = view.visibleEvents;
    const prevCount = prevEventCountRef.current;
    prevEventCountRef.current = events.length;
    if (prevCount === null || events.length <= prevCount) return;

    const newEvents = events.slice(prevCount);
    const eliminationEvent = [...newEvents].reverse().find((e) => e.type === 'death' || e.type === 'kicked');
    if (!eliminationEvent) return;

    const targetId = (eliminationEvent.payload.targetId ?? eliminationEvent.payload.actorId) as string;
    const target = view.players.find((p) => p.userId === targetId);
    const causeText =
      eliminationEvent.type === 'kicked'
        ? 'Removed by the host.'
        : eliminationEvent.payload.cause === 'mafia'
          ? 'Killed during the night.'
          : 'Voted out by the town.';

    if (eliminationTimeoutRef.current) clearTimeout(eliminationTimeoutRef.current);
    setEliminationInfo({
      userId: targetId,
      name: target?.displayName ?? 'Someone',
      role: target?.revealedRole ?? null,
      causeText,
    });
    eliminationTimeoutRef.current = setTimeout(() => setEliminationInfo(null), 5000);
  }, [view]);

  // Night <-> day category changes get a brief title-card beat instead of snapping straight
  // into the next phase's UI.
  useEffect(() => {
    if (!view) {
      prevPhaseRef.current = null;
      return;
    }
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = view.phase;
    if (prev === null || prev === view.phase) return;

    let text: string | null = null;
    if (prev !== 'night' && view.phase === 'night') text = '🌙 Night Falls...';
    else if ((prev === 'night' || prev === 'night_resolution') && view.phase === 'day_discussion') {
      text = '☀️ Day Breaks...';
    }
    if (!text) return;

    setTransitionText(text);
    const t = setTimeout(() => setTransitionText(null), 1800);
    return () => clearTimeout(t);
  }, [view?.phase]);

  if (!session) return null;

  const remainingSeconds = view?.phaseEndsAt
    ? Math.max(0, Math.round((new Date(view.phaseEndsAt).getTime() - now) / 1000))
    : null;
  const nameById = new Map((view?.players ?? []).map((p) => [p.userId, p.displayName]));
  const investigatedById = new Map((view?.investigationHistory ?? []).map((r) => [r.targetId, r.isMafia]));

  const isHost = room?.hostId === session.userId;
  const canStart = isHost && room && room.playerIds.length >= room.minPlayers;
  const background = view ? (PHASE_BACKGROUND[view.phase] ?? 'from-slate-950 to-slate-950') : 'from-slate-950 to-slate-950';

  function startGame() {
    if (!session) return;
    getSocket().emit('room:start', { roomCode: session.roomCode });
  }

  function sendChat() {
    if (!chatInput.trim() || !session) return;
    getSocket().emit('chat:message', { roomCode: session.roomCode, text: chatInput.trim() });
    setChatInput('');
  }

  function sendMafiaChat() {
    if (!mafiaChatInput.trim() || !session) return;
    getSocket().emit('mafia:chat', { roomCode: session.roomCode, text: mafiaChatInput.trim() });
    setMafiaChatInput('');
  }

  function submitTarget(targetId: string) {
    if (!session || !view) return;
    if (view.phase === 'night') {
      getSocket().emit('night:action', { roomCode: session.roomCode, targetId });
      setSelectedTargetId(targetId);
    } else if (view.phase === 'day_voting') {
      getSocket().emit('day:vote', { roomCode: session.roomCode, targetId });
      setSelectedTargetId(targetId);
    }
  }

  function sendLastWords() {
    if (!lastWordsInput.trim() || !session) return;
    getSocket().emit('game:lastWords', { roomCode: session.roomCode, text: lastWordsInput.trim() });
    setLastWordsInput('');
  }

  function kickPlayer(targetUserId: string) {
    if (!session) return;
    getSocket().emit('room:kick', { roomCode: session.roomCode, targetUserId });
  }

  function skipPhase() {
    if (!session) return;
    getSocket().emit('room:skipPhase', { roomCode: session.roomCode });
  }

  function restartGame() {
    if (!session) return;
    if (!window.confirm('Restart the game? Everyone will be sent back to the lobby.')) return;
    getSocket().emit('room:restart', { roomCode: session.roomCode });
  }

  return (
    <main
      className={`min-h-screen bg-gradient-to-b ${background} px-4 pt-6 pb-40 transition-colors duration-1000 sm:px-6 sm:pt-10 sm:pb-10`}
    >
      <PhaseTransitionBanner text={transitionText} />

      {view && showRoleCard && (
        <RoleRevealCard role={view.self.role} onDismiss={() => setShowRoleCard(false)} />
      )}

      <EliminationOverlay info={eliminationInfo} onDismiss={() => setEliminationInfo(null)} />

      {view?.winner && !winScreenDismissed && (
        <WinScreen
          winner={view.winner}
          players={view.players.map((p) => ({ userId: p.userId, displayName: p.displayName, role: p.revealedRole }))}
          onDismiss={() => setWinScreenDismissed(true)}
        />
      )}

      <div className="mx-auto w-full max-w-5xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Room {session.roomCode}</h1>
        {error && <p className="text-sm text-rose-400">{error}</p>}

        {!view && room && (
          <section className={panelClass}>
            <h2 className="text-lg font-semibold">Lobby</h2>
            <p className="mt-1 text-sm text-slate-400">
              {room.playerIds.length} / {room.maxPlayers} players (min {room.minPlayers} to start)
            </p>
            <p className="text-sm text-slate-400">Night timer: {room.nightDurationSeconds}s</p>

            <div className="mt-3">
              <Rules />
            </div>

            <ul className="mt-3 space-y-2">
              {room.players.map((p) => (
                <li key={p.userId} className="flex items-center gap-2">
                  <Avatar id={p.userId} name={p.displayName} />
                  <span className="text-sm">
                    {p.userId === session.userId ? `${session.displayName} (you)` : p.displayName}
                    {p.userId === room.hostId && <span className="ml-1 text-slate-500"> — host</span>}
                  </span>
                  {isHost && p.userId !== session.userId && (
                    <button onClick={() => kickPlayer(p.userId)} className={`${dangerGhostButtonClass} ml-auto`}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {isHost && (
              <button onClick={startGame} disabled={!canStart} className={`${primaryButtonClass} mt-4 w-full`}>
                Start Game
              </button>
            )}
          </section>
        )}

        {view && (
          <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6">
            <section className="space-y-4">
              <div className={panelClass}>
                <h2 className="flex flex-wrap items-baseline gap-3 text-lg font-semibold">
                  <span>
                    Day {view.dayNumber} — {PHASE_LABELS[view.phase] ?? view.phase}
                  </span>
                  {remainingSeconds !== null && (
                    <span className={`text-sm font-normal ${remainingSeconds <= 5 ? 'text-rose-400' : 'text-sky-300'}`}>
                      ⏱ {formatRemaining(remainingSeconds)}
                    </span>
                  )}
                </h2>

                {isHost && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {view.phase !== 'game_over' && (
                      <button onClick={skipPhase} className={ghostButtonClass}>
                        Skip Phase
                      </button>
                    )}
                    <button onClick={restartGame} className={ghostButtonClass}>
                      Restart Game
                    </button>
                  </div>
                )}

                <div className="mt-3">
                  <Rules />
                </div>

                <p className="mt-3 text-sm">
                  Your role:{' '}
                  <span className={`font-semibold ${ROLE_COLORS[view.self.role] ?? 'text-slate-200'}`}>
                    {ROLE_EMOJI[view.self.role] ?? ''} {view.self.role}
                  </span>
                </p>
                {roleInstructions(view.phase, view.self.role, view.self.isAlive) && (
                  <p className="mt-1 text-sm text-slate-400">
                    {roleInstructions(view.phase, view.self.role, view.self.isAlive)}
                  </p>
                )}
                {!view.self.isAlive && (
                  <p className="mt-1 text-sm text-rose-400">You have been eliminated. You can keep watching.</p>
                )}
              </div>

              {view.phase === 'elimination' && view.lastEliminatedId === view.self.userId && (
                <div className="rounded-lg border border-rose-800 bg-rose-950/40 p-4">
                  <p className="mb-2 text-sm">You were voted out. Any last words?</p>
                  <div className="flex gap-2">
                    <input
                      value={lastWordsInput}
                      onChange={(e) => setLastWordsInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendLastWords()}
                      className={inputClass}
                    />
                    <button onClick={sendLastWords} className={primaryButtonClass}>
                      Send
                    </button>
                  </div>
                </div>
              )}

              {view.lastInvestigationResult && (
                <p className="text-sm text-slate-300">
                  Investigation result: {nameById.get(view.lastInvestigationResult.targetId) ?? 'Someone'} is{' '}
                  <span className={view.lastInvestigationResult.isMafia ? 'text-rose-400' : 'text-emerald-400'}>
                    {view.lastInvestigationResult.isMafia ? 'Mafia' : 'not Mafia'}
                  </span>
                  .
                </p>
              )}

              <div className={panelClass}>
                <PlayerGrid>
                  {view.players.map((p) => {
                    const avatarState: AvatarState = !p.isAlive ? 'dead' : view.phase === 'night' ? 'sleeping' : 'idle';
                    const canTargetSelf = p.userId === view.self.userId && view.self.role === 'doctor';
                    const canAct =
                      view.self.isAlive &&
                      p.isAlive &&
                      (p.userId !== view.self.userId || canTargetSelf) &&
                      ACTING_ROLES.has(view.self.role) &&
                      view.phase === 'night';
                    const canVote =
                      view.self.isAlive && p.isAlive && p.userId !== view.self.userId && view.phase === 'day_voting';
                    const alreadyInvestigated = view.self.role === 'detective' && investigatedById.has(p.userId);
                    const selected = p.userId === selectedTargetId;

                    return (
                      <PlayerCard key={p.userId} highlighted={selected} dimmed={!p.isAlive}>
                        <Avatar id={p.userId} name={p.displayName} size="lg" state={avatarState} />
                        <p className="text-xs leading-tight font-medium">
                          {p.displayName}
                          {p.userId === view.self.userId && <span className="text-slate-500"> (you)</span>}
                        </p>
                        <p className="h-3 text-[10px] leading-tight text-amber-400">
                          {!p.isAlive ? '' : !p.isConnected ? 'Disconnected' : ''}
                        </p>
                        {p.revealedRole && (
                          <p className={`text-[10px] font-semibold ${ROLE_COLORS[p.revealedRole] ?? 'text-slate-400'}`}>
                            {ROLE_EMOJI[p.revealedRole] ?? ''} {p.revealedRole}
                          </p>
                        )}

                        {canAct && alreadyInvestigated ? (
                          <span
                            className={`text-[11px] font-semibold ${
                              investigatedById.get(p.userId) ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            {investigatedById.get(p.userId) ? '⚠ Mafia' : '✓ Not Mafia'}
                          </span>
                        ) : canAct ? (
                          <button
                            onClick={() => submitTarget(p.userId)}
                            disabled={selected}
                            className={`w-full ${selected ? selectedActionButtonClass : actionButtonClass}`}
                          >
                            {p.userId === view.self.userId && !selected
                              ? 'Protect Yourself'
                              : nightActionLabel(view.self.role, selected)}
                          </button>
                        ) : null}

                        {canVote && (
                          <button
                            onClick={() => submitTarget(p.userId)}
                            disabled={selected}
                            className={`w-full ${selected ? selectedActionButtonClass : actionButtonClass}`}
                          >
                            {selected ? '✓ Voted' : 'Vote'}
                          </button>
                        )}

                        {isHost && p.isAlive && p.userId !== view.self.userId && (
                          <button onClick={() => kickPlayer(p.userId)} className={`w-full ${dangerGhostButtonClass}`}>
                            Remove
                          </button>
                        )}
                      </PlayerCard>
                    );
                  })}
                </PlayerGrid>
              </div>

              {view.self.role === 'mafia' && view.self.isAlive && (
                <section className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-4">
                  <h3 className="font-semibold text-rose-300">🔪 Mafia Chat</h3>
                  <p className="mt-1 text-xs text-rose-200/70">
                    This is a closed discussion — only fellow Mafia can see it. Your goal: agree on a target each
                    night and eliminate Villagers, the Doctor, and the Detective until the Mafia equal or outnumber
                    everyone left alive.
                  </p>

                  {mafiaTargets.length > 0 ? (
                    <ul className="mt-2 space-y-0.5 text-sm text-rose-100">
                      {mafiaTargets.map((t) => (
                        <li key={t.actorId}>
                          {t.actorDisplayName} → {t.targetDisplayName}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-rose-200/60">No targets picked yet tonight.</p>
                  )}

                  <div
                    ref={mafiaChatScrollRef}
                    className="mt-3 h-24 space-y-1 overflow-y-auto rounded-md border border-rose-900/40 bg-slate-950/40 p-2 text-sm"
                  >
                    {mafiaChat.map((m, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Avatar id={m.userId} name={m.displayName} size="sm" />
                        <span>
                          <strong>{m.displayName}:</strong> {m.text}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={mafiaChatInput}
                      onChange={(e) => setMafiaChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendMafiaChat()}
                      className={inputClass}
                    />
                    <button onClick={sendMafiaChat} className={primaryButtonClass}>
                      Send
                    </button>
                  </div>
                </section>
              )}
            </section>

            <aside className="mt-4 lg:sticky lg:top-6 lg:mt-0">
              <div className={`${panelClass} max-h-64 overflow-y-auto lg:max-h-[70vh]`}>
                <h3 className="mb-2 font-semibold">Timeline</h3>
                {view.visibleEvents.length > 0 ? (
                  groupEventsByDay(view.visibleEvents).map(([day, events]) => (
                    <div key={day} className="mb-3 last:mb-0">
                      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Day {day}</p>
                      <div className="space-y-1 text-sm text-slate-300">
                        {events.map((e, i) => (
                          <p key={i}>{describeEvent(e, nameById)}</p>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">Nothing has happened yet.</p>
                )}
              </div>
            </aside>
          </div>
        )}

        <section className={panelClass}>
          <h3 className="font-semibold">Public Chat</h3>
          <div
            ref={chatScrollRef}
            className="mt-2 h-40 space-y-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/40 p-2 text-sm"
          >
            {chat.map((m, i) => (
              <div key={i} className="flex items-start gap-2">
                <Avatar id={m.userId} name={m.displayName} size="sm" />
                <span>
                  <strong>{m.displayName}:</strong> {m.text}
                </span>
              </div>
            ))}
          </div>
          {view && !view.self.isAlive ? (
            <p className="mt-2 text-sm text-slate-500">
              You've been eliminated — Public Chat is muted for the rest of this game.
            </p>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                className={inputClass}
              />
              <button onClick={sendChat} className={primaryButtonClass}>
                Send
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
