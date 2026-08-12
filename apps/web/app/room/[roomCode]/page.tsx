'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '../../../lib/socket';
import { loadSession, type AnonSession } from '../../../lib/session';
import type { PlayerView, Room } from '@mafia/shared';

const ACTING_ROLES = new Set(['mafia', 'doctor', 'detective']);

function formatRemaining(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function RoomPage() {
  const params = useParams<{ roomCode: string }>();
  const router = useRouter();
  const [session, setSession] = useState<AnonSession | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [chat, setChat] = useState<Array<{ displayName: string; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
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
    socket.on('room:updated', setRoom);
    socket.on('game:view', setView);
    socket.on('error', (payload) => setError(payload.message));
    socket.on('chat:message', (msg) =>
      setChat((prev) => [...prev, { displayName: msg.displayName, text: msg.text }])
    );

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
      socket.off('room:updated', setRoom);
      socket.off('game:view', setView);
      socket.off('error');
      socket.off('chat:message');
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

  function submitTarget(targetId: string) {
    if (!session || !view) return;
    if (view.phase === 'night') {
      getSocket().emit('night:action', { roomCode: session.roomCode, targetId });
    } else if (view.phase === 'day_voting') {
      getSocket().emit('day:vote', { roomCode: session.roomCode, targetId });
    }
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
          <ul>
            {room.players.map((p) => (
              <li key={p.userId}>
                {p.userId === session.userId ? `${session.displayName} (you)` : p.displayName}
                {p.userId === room.hostId ? ' — host' : ''}
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
            Day {view.dayNumber} — {view.phase.replace('_', ' ')}
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
          <p>Your role: {view.self.role}</p>
          {!view.self.isAlive && <p style={{ color: '#f66' }}>You have been eliminated. You can keep watching.</p>}
          {view.winner && <h3>Game over — {view.winner} win!</h3>}

          {view.lastInvestigationResult && (
            <p>
              Investigation result: {view.lastInvestigationResult.targetId} is{' '}
              {view.lastInvestigationResult.isMafia ? 'Mafia' : 'not Mafia'}.
            </p>
          )}

          <ul>
            {view.players.map((p) => (
              <li key={p.userId} style={{ opacity: p.isAlive ? 1 : 0.4 }}>
                {p.displayName}
                {!p.isAlive ? ' (dead)' : ''}
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
              </li>
            ))}
          </ul>
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
