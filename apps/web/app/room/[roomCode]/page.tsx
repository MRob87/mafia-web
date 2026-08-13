'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '../../../lib/socket';
import { loadSession, clearSession, type AnonSession } from '../../../lib/session';
import { Avatar } from '../../../components/Avatar';
import { Rules } from '../../../components/Rules';
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

const ROLE_COLORS: Record<string, string> = {
  mafia: 'text-rose-400',
  doctor: 'text-emerald-400',
  detective: 'text-sky-400',
  villager: 'text-slate-300',
};

function formatRemaining(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

const inputClass =
  'min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500';
const primaryButtonClass =
  'shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50';
const ghostButtonClass =
  'rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800';
const dangerGhostButtonClass =
  'rounded-md border border-rose-900/60 px-2 py-1 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-950/50';
const actionButtonClass =
  'shrink-0 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-500';
const selectedActionButtonClass = 'shrink-0 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white';
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
      }
    };
    socket.on('room:updated', handleRoomUpdated);
    socket.on('game:view', setView);
    socket.on('room:kicked', () => {
      clearSession();
      router.replace('/');
    });
    socket.on('error', (payload) => setError(payload.message));
    socket.on('chat:message', (msg) =>
      setChat((prev) => [...prev, { userId: msg.fromUserId, displayName: msg.displayName, text: msg.text }])
    );
    socket.on('mafia:chat', (msg) =>
      setMafiaChat((prev) => [...prev, { userId: msg.fromUserId, displayName: msg.displayName, text: msg.text }])
    );
    socket.on('game:mafiaNightStatus', (status) => setMafiaTargets(status.targets));

    // Fetch current state immediately instead of waiting on a broadcast — a broadcast
    // fired right after room:create/room:join can arrive before this listener is
    // attached (e.g. while the route is still mounting) and would otherwise be missed.
    socket.emit('room:sync', { roomCode: s.roomCode, userId: s.userId }, (res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRoom(res.room);
      if (res.view) setView(res.view);
    });

    return () => {
      socket.off('room:updated', handleRoomUpdated);
      socket.off('game:view', setView);
      socket.off('room:kicked');
      socket.off('error');
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

  if (!session) return null;

  const remainingSeconds = view?.phaseEndsAt
    ? Math.max(0, Math.round((new Date(view.phaseEndsAt).getTime() - now) / 1000))
    : null;
  const nameById = new Map((view?.players ?? []).map((p) => [p.userId, p.displayName]));

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
    <main className={`min-h-screen bg-gradient-to-b ${background} px-4 py-6 transition-colors duration-1000 sm:px-6 sm:py-10`}>
      <div className="mx-auto w-full max-w-2xl space-y-6">
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
                  {view.self.role}
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
              {view.winner && <h3 className="mt-2 text-base font-bold text-amber-300">Game over — {view.winner} win!</h3>}
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

            {view.visibleEvents.length > 0 && (
              <div className={`${panelClass} max-h-32 space-y-1 overflow-y-auto text-sm text-slate-300`}>
                {view.visibleEvents.map((e, i) => (
                  <p key={i}>{describeEvent(e, nameById)}</p>
                ))}
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

            <ul className={`${panelClass} space-y-2`}>
              {view.players.map((p) => (
                <li
                  key={p.userId}
                  className={`flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 ${
                    p.userId === selectedTargetId ? 'bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/50' : ''
                  } ${p.isAlive ? '' : 'opacity-40'}`}
                >
                  <Avatar id={p.userId} name={p.displayName} />
                  <span className="text-sm">
                    {p.displayName}
                    {p.userId === view.self.userId && <span className="text-slate-500"> (you)</span>}
                    {!p.isAlive && <span className="text-slate-500"> (dead)</span>}
                    {p.isAlive && !p.isConnected && <span className="text-amber-400"> (disconnected)</span>}
                    {p.revealedRole && <span className={`ml-1 ${ROLE_COLORS[p.revealedRole]}`}> — {p.revealedRole}</span>}
                  </span>

                  <div className="ml-auto flex gap-1.5">
                    {view.self.isAlive &&
                      p.isAlive &&
                      // Every acting role but the Doctor can only target someone else — the
                      // Doctor is explicitly allowed to protect themselves (see Rules).
                      (p.userId !== view.self.userId || view.self.role === 'doctor') &&
                      ACTING_ROLES.has(view.self.role) &&
                      view.phase === 'night' && (
                        <button
                          onClick={() => submitTarget(p.userId)}
                          className={p.userId === selectedTargetId ? selectedActionButtonClass : actionButtonClass}
                        >
                          {p.userId === selectedTargetId
                            ? '✓ Targeted'
                            : p.userId === view.self.userId
                              ? 'Protect Yourself'
                              : 'Target'}
                        </button>
                      )}
                    {view.self.isAlive && p.isAlive && p.userId !== view.self.userId && view.phase === 'day_voting' && (
                      <button
                        onClick={() => submitTarget(p.userId)}
                        className={p.userId === selectedTargetId ? selectedActionButtonClass : actionButtonClass}
                      >
                        {p.userId === selectedTargetId ? '✓ Voted' : 'Vote'}
                      </button>
                    )}
                    {isHost && p.isAlive && p.userId !== view.self.userId && (
                      <button onClick={() => kickPlayer(p.userId)} className={dangerGhostButtonClass}>
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {view.self.role === 'mafia' && view.self.isAlive && (
              <section className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-4">
                <h3 className="font-semibold text-rose-300">🔪 Mafia Chat</h3>
                <p className="mt-1 text-xs text-rose-200/70">
                  This is a closed discussion — only fellow Mafia can see it. Your goal: agree on a target each night
                  and eliminate Villagers, the Doctor, and the Detective until the Mafia equal or outnumber everyone
                  left alive.
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

                <div className="mt-3 h-24 space-y-1 overflow-y-auto rounded-md border border-rose-900/40 bg-slate-950/40 p-2 text-sm">
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
        )}

        <section className={panelClass}>
          <h3 className="font-semibold">Public Chat</h3>
          <div className="mt-2 h-40 space-y-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/40 p-2 text-sm">
            {chat.map((m, i) => (
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
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              className={inputClass}
            />
            <button onClick={sendChat} className={primaryButtonClass}>
              Send
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
