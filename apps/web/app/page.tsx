'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '../lib/socket';
import { saveSession } from '../lib/session';
import { Rules } from '../components/Rules';
import { ToastStack, type ToastMessage } from '../components/Toast';
import type { Room } from '@mafia/shared';

const NIGHT_DURATION_OPTIONS = [15, 30, 45, 60];

export default function HomePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [nightDurationSeconds, setNightDurationSeconds] = useState(30);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pending, setPending] = useState(false);
  const toastIdRef = useRef(0);

  function pushToast(text: string) {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, text }]);
  }
  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  useEffect(() => {
    const socket = getSocket();
    const handleConnectError = (err: Error) => {
      setPending(false);
      pushToast(`Can't reach the game server (${err.message}). Check you're using the right address.`);
    };
    socket.on('connect_error', handleConnectError);
    return () => {
      socket.off('connect_error', handleConnectError);
    };
  }, []);

  function enterRoom(room: Room, userId: string) {
    saveSession({ userId, displayName, roomCode: room.roomCode });
    router.push(`/room/${room.roomCode}`);
  }

  function handleCreate() {
    if (!displayName.trim()) {
      pushToast('Enter a display name first.');
      return;
    }
    setPending(true);
    getSocket().emit('room:create', { displayName, nightDurationSeconds }, (res) => {
      setPending(false);
      if (!res.ok) {
        pushToast(res.error);
        return;
      }
      enterRoom(res.room, res.userId);
    });
  }

  function handleJoin() {
    if (!displayName.trim() || !roomCode.trim()) {
      pushToast('Enter a display name and room code.');
      return;
    }
    setPending(true);
    getSocket().emit('room:join', { roomCode: roomCode.trim().toUpperCase(), displayName }, (res) => {
      setPending(false);
      if (!res.ok) {
        pushToast(res.error);
        return;
      }
      enterRoom(res.room, res.userId);
    });
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-10 pb-40 sm:pt-16 sm:pb-16">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <h1 className="text-3xl font-bold tracking-tight">Mafia</h1>
      <p className="mt-1 text-sm text-slate-400">No account needed — just pick a name for this session.</p>

      <div className="mt-6">
        <Rules defaultOpen title="How to play" />
      </div>

      <div className="mt-6 space-y-4">
        <input
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-100 outline-none focus:border-indigo-500"
        />

        <div>
          <p className="text-sm text-slate-400">Night timer (seconds)</p>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {NIGHT_DURATION_OPTIONS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                onClick={() => setNightDurationSeconds(seconds)}
                className={
                  seconds === nightDurationSeconds
                    ? 'rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white'
                    : 'rounded-lg border border-slate-700 py-3 text-sm text-slate-300 transition-colors hover:bg-slate-800'
                }
              >
                {seconds}s
              </button>
            ))}
          </div>
        </div>

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
      </div>
    </main>
  );
}
