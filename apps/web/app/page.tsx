'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '../lib/socket';
import { saveSession } from '../lib/session';
import type { Room } from '@mafia/shared';

export default function HomePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function enterRoom(room: Room, userId: string) {
    saveSession({ userId, displayName, roomCode: room.roomCode });
    router.push(`/room/${room.roomCode}`);
  }

  function handleCreate() {
    if (!displayName.trim()) {
      setError('Enter a display name first.');
      return;
    }
    setPending(true);
    setError(null);
    getSocket().emit('room:create', { displayName }, (res) => {
      setPending(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      enterRoom(res.room, res.userId);
    });
  }

  function handleJoin() {
    if (!displayName.trim() || !roomCode.trim()) {
      setError('Enter a display name and room code.');
      return;
    }
    setPending(true);
    setError(null);
    getSocket().emit('room:join', { roomCode: roomCode.trim().toUpperCase(), displayName }, (res) => {
      setPending(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      enterRoom(res.room, res.userId);
    });
  }

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: 24 }}>
      <h1>Mafia</h1>
      <p style={{ opacity: 0.7 }}>No account needed — just pick a name for this session.</p>

      <details open style={{ border: '1px solid #333', borderRadius: 8, padding: '10px 16px', marginBottom: 24 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>How to play</summary>
        <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, opacity: 0.85 }}>
          <p>
            <strong>Goal:</strong> Villagers win by voting out every Mafia member. Mafia win once they equal or
            outnumber everyone left alive.
          </p>
          <p>Each round has two phases:</p>
          <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
            <li>
              <strong>Night</strong> — Mafia, Doctor, and Detective each secretly choose a target.
            </li>
            <li>
              <strong>Day</strong> — everyone discusses, then votes to eliminate a suspect.
            </li>
          </ul>
          <p style={{ marginBottom: 4 }}>
            <strong>Roles:</strong>
          </p>
          <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
            <li>
              <strong>Villager</strong> — no special ability. Use discussion and voting to find the Mafia.
            </li>
            <li>
              <strong>Mafia</strong> — each night, secretly choose a player to eliminate. Knows who the other Mafia
              are.
            </li>
            <li>
              <strong>Doctor</strong> — each night, choose a player to protect from the Mafia's kill.
            </li>
            <li>
              <strong>Detective</strong> — each night, investigate a player to learn whether they're Mafia.
            </li>
          </ul>
        </div>
      </details>

      <input
        placeholder="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        style={{ width: '100%', padding: 10, marginBottom: 12 }}
      />

      <button onClick={handleCreate} disabled={pending} style={{ width: '100%', padding: 10, marginBottom: 24 }}>
        Create Room
      </button>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="Room code"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
          style={{ flex: 1, padding: 10 }}
        />
        <button onClick={handleJoin} disabled={pending} style={{ padding: 10 }}>
          Join
        </button>
      </div>

      {error && (
        <p style={{ color: '#f66', marginTop: 16 }}>
          {error}
        </p>
      )}
    </main>
  );
}
