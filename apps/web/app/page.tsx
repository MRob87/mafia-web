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
  const [nightDurationSeconds, setNightDurationSeconds] = useState(30);
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
    getSocket().emit('room:create', { displayName, nightDurationSeconds }, (res) => {
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
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight">Mafia</h1>
      <p className="mt-1 text-sm text-slate-400">No account needed — just pick a name for this session.</p>

      <details open className="mt-6 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <summary className="cursor-pointer select-none font-semibold text-slate-100">How to play</summary>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">
          <p>
            <strong className="text-slate-100">Goal:</strong> Villagers win by voting out every Mafia member. Mafia
            win once they equal or outnumber everyone left alive.
          </p>
          <p>Each round has two phases:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-slate-100">Night</strong> — Mafia, Doctor, and Detective each secretly choose a
              target.
            </li>
            <li>
              <strong className="text-slate-100">Day</strong> — everyone discusses, then votes to eliminate a
              suspect.
            </li>
          </ul>
          <p className="font-semibold text-slate-100">Roles:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-rose-400">Mafia</strong> — each night, secretly choose a player to eliminate.
              Knows who the other Mafia are.
            </li>
            <li>
              <strong className="text-emerald-400">Doctor</strong> — each night, choose a player to protect from the
              Mafia's kill.
            </li>
            <li>
              <strong className="text-sky-400">Detective</strong> — each night, investigate a player to learn
              whether they're Mafia.
            </li>
            <li>
              <strong className="text-slate-300">Villager</strong> — no special ability. Use discussion and voting to
              find the Mafia.
            </li>
          </ul>
        </div>
      </details>

      <div className="mt-6 space-y-4">
        <input
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-100 outline-none focus:border-indigo-500"
        />

        <label className="block text-sm text-slate-400">
          Night timer (seconds)
          <input
            type="number"
            min={10}
            max={120}
            value={nightDurationSeconds}
            onChange={(e) => setNightDurationSeconds(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-100 outline-none focus:border-indigo-500"
          />
        </label>

        <button
          onClick={handleCreate}
          disabled={pending}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          Create Room
        </button>

        <div className="flex gap-2">
          <input
            placeholder="Room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-100 outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleJoin}
            disabled={pending}
            className="shrink-0 rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-100 transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            Join
          </button>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
    </main>
  );
}
