'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '../../../lib/socket';
import { loadSession, clearSession, type AnonSession } from '../../../lib/session';
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

export default function RoomPage() {
  const params = useParams<{ roomCode: string }>();
  const router = useRouter();
  const [session, setSession] = useState<AnonSession | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [chat, setChat] = useState<Array<{ displayName: string; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [mafiaChat, setMafiaChat] = useState<Array<{ displayName: string; text: string }>>([]);
  const [mafiaChatInput, setMafiaChatInput] = useState('');
  const [mafiaTargets, setMafiaTargets] = useState<
    Array<{ actorId: string; actorDisplayName: string; targetId: string; targetDisplayName: string }>
  >([]);
  const [lastWordsInput, setLastWordsInput] = useState('');
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
      setChat((prev) => [...prev, { displayName: msg.displayName, text: msg.text }])
    );
    socket.on('mafia:chat', (msg) =>
      setMafiaChat((prev) => [...prev, { displayName: msg.displayName, text: msg.text }])
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

  if (!session) return null;

  const remainingSeconds = view?.phaseEndsAt
    ? Math.max(0, Math.round((new Date(view.phaseEndsAt).getTime() - now) / 1000))
    : null;
  const nameById = new Map((view?.players ?? []).map((p) => [p.userId, p.displayName]));

  const isHost = room?.hostId === session.userId;
  const canStart = isHost && room && room.playerIds.length >= room.minPlayers;

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
    } else if (view.phase === 'day_voting') {
      getSocket().emit('day:vote', { roomCode: session.roomCode, targetId });
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
    <main style={{ maxWidth: 640, margin: '40px auto', padding: 24 }}>
      <h1>Room {session.roomCode}</h1>
      {error && <p style={{ color: '#f66' }}>{error}</p>}

      {!view && room && (
        <section>
          <h2>Lobby</h2>
          <p>
            {room.playerIds.length} / {room.maxPlayers} players (min {room.minPlayers} to start)
          </p>
          <p style={{ opacity: 0.7, fontSize: 14 }}>Night timer: {room.nightDurationSeconds}s</p>
          <ul>
            {room.players.map((p) => (
              <li key={p.userId}>
                {p.userId === session.userId ? `${session.displayName} (you)` : p.displayName}
                {p.userId === room.hostId ? ' — host' : ''}
                {isHost && p.userId !== session.userId && (
                  <button onClick={() => kickPlayer(p.userId)} style={{ marginLeft: 8 }}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {isHost && (
            <button onClick={startGame} disabled={!canStart} style={{ padding: 10 }}>
              Start Game
            </button>
          )}
        </section>
      )}

      {view && (
        <section>
          <h2>
            Day {view.dayNumber} — {PHASE_LABELS[view.phase] ?? view.phase}
            {remainingSeconds !== null && (
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 16,
                  fontWeight: 400,
                  color: remainingSeconds <= 5 ? '#f66' : '#9cf',
                }}
              >
                ⏱ {formatRemaining(remainingSeconds)}
              </span>
            )}
          </h2>

          {isHost && (
            <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
              {view.phase !== 'game_over' && (
                <button onClick={skipPhase} style={{ padding: 6, fontSize: 13 }}>
                  Skip Phase
                </button>
              )}
              <button onClick={restartGame} style={{ padding: 6, fontSize: 13 }}>
                Restart Game
              </button>
            </div>
          )}

          <p>Your role: {view.self.role}</p>
          {roleInstructions(view.phase, view.self.role, view.self.isAlive) && (
            <p style={{ opacity: 0.85, fontSize: 14 }}>
              {roleInstructions(view.phase, view.self.role, view.self.isAlive)}
            </p>
          )}
          {!view.self.isAlive && <p style={{ color: '#f66' }}>You have been eliminated. You can keep watching.</p>}
          {view.winner && <h3>Game over — {view.winner} win!</h3>}

          {view.phase === 'elimination' && view.lastEliminatedId === view.self.userId && (
            <div style={{ border: '1px solid #f66', borderRadius: 6, padding: 8, marginBottom: 12 }}>
              <p style={{ margin: '0 0 6px 0' }}>You were voted out. Any last words?</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={lastWordsInput}
                  onChange={(e) => setLastWordsInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendLastWords()}
                  style={{ flex: 1, padding: 8 }}
                />
                <button onClick={sendLastWords} style={{ padding: 8 }}>
                  Send
                </button>
              </div>
            </div>
          )}

          {view.visibleEvents.length > 0 && (
            <div
              style={{
                border: '1px solid #333',
                borderRadius: 6,
                padding: '8px 12px',
                marginBottom: 12,
                fontSize: 14,
                opacity: 0.85,
                maxHeight: 120,
                overflowY: 'auto',
              }}
            >
              {view.visibleEvents.map((e, i) => (
                <p key={i} style={{ margin: '2px 0' }}>
                  {describeEvent(e, nameById)}
                </p>
              ))}
            </div>
          )}

          {view.lastInvestigationResult && (
            <p>
              Investigation result: {nameById.get(view.lastInvestigationResult.targetId) ?? 'Someone'} is{' '}
              {view.lastInvestigationResult.isMafia ? 'Mafia' : 'not Mafia'}.
            </p>
          )}

          <ul>
            {view.players.map((p) => (
              <li key={p.userId} style={{ opacity: p.isAlive ? 1 : 0.4 }}>
                {p.displayName}
                {p.userId === view.self.userId ? ' (you)' : ''}
                {!p.isAlive ? ' (dead)' : ''}
                {p.isAlive && !p.isConnected ? ' (disconnected)' : ''}
                {p.revealedRole ? ` — ${p.revealedRole}` : ''}
                {view.self.isAlive &&
                  p.isAlive &&
                  p.userId !== view.self.userId &&
                  ACTING_ROLES.has(view.self.role) &&
                  view.phase === 'night' && (
                    <button onClick={() => submitTarget(p.userId)} style={{ marginLeft: 8 }}>
                      Target
                    </button>
                  )}
                {view.self.isAlive && p.isAlive && p.userId !== view.self.userId && view.phase === 'day_voting' && (
                  <button onClick={() => submitTarget(p.userId)} style={{ marginLeft: 8 }}>
                    Vote
                  </button>
                )}
                {isHost && p.isAlive && p.userId !== view.self.userId && (
                  <button onClick={() => kickPlayer(p.userId)} style={{ marginLeft: 8 }}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>

          {view.self.role === 'mafia' && view.self.isAlive && (
            <section
              style={{ marginTop: 16, border: '1px solid #833', borderRadius: 6, padding: '8px 12px' }}
            >
              <h3 style={{ margin: '4px 0' }}>🔪 Mafia Chat</h3>
              <p style={{ opacity: 0.8, fontSize: 13, margin: '0 0 8px 0' }}>
                This is a closed discussion — only fellow Mafia can see it. Your goal: agree on a target each night
                and eliminate Villagers, the Doctor, and the Detective until the Mafia equal or outnumber everyone
                left alive.
              </p>
              {mafiaTargets.length > 0 ? (
                <ul style={{ margin: '4px 0' }}>
                  {mafiaTargets.map((t) => (
                    <li key={t.actorId}>
                      {t.actorDisplayName} → {t.targetDisplayName}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ opacity: 0.7, fontSize: 14 }}>No targets picked yet tonight.</p>
              )}
              <div style={{ height: 100, overflowY: 'auto', border: '1px solid #333', padding: 8, margin: '8px 0' }}>
                {mafiaChat.map((m, i) => (
                  <div key={i}>
                    <strong>{m.displayName}:</strong> {m.text}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={mafiaChatInput}
                  onChange={(e) => setMafiaChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMafiaChat()}
                  style={{ flex: 1, padding: 8 }}
                />
                <button onClick={sendMafiaChat} style={{ padding: 8 }}>
                  Send
                </button>
              </div>
            </section>
          )}
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <h3>Chat</h3>
        <div style={{ height: 160, overflowY: 'auto', border: '1px solid #333', padding: 8, marginBottom: 8 }}>
          {chat.map((m, i) => (
            <div key={i}>
              <strong>{m.displayName}:</strong> {m.text}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendChat()}
            style={{ flex: 1, padding: 8 }}
          />
          <button onClick={sendChat} style={{ padding: 8 }}>
            Send
          </button>
        </div>
      </section>
    </main>
  );
}
