'use client';

import { motion } from 'framer-motion';
import type { Role } from '@mafia/shared';
import { Avatar } from './Avatar';
import { ROLE_COLORS } from '../lib/roleTheme';
import { useTheme } from '../lib/theme';

const CONFETTI_COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#facc15'];
const CONFETTI_PIECES = Array.from({ length: 36 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  delay: Math.random() * 0.6,
  duration: 2.2 + Math.random() * 1.4,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

export function WinScreen({
  winner,
  players,
  onDismiss,
}: {
  winner: 'mafia' | 'villagers';
  players: Array<{ userId: string; displayName: string; role: string | null }>;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  return (
    <div
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-slate-950/95 p-6"
      onClick={onDismiss}
    >
      {CONFETTI_PIECES.map((c) => (
        <motion.span
          key={c.id}
          initial={{ top: '-5%', left: `${c.left}%`, opacity: 1, rotate: 0 }}
          animate={{ top: '105%', rotate: 360 }}
          transition={{ delay: c.delay, duration: c.duration, ease: 'linear', repeat: Infinity }}
          className="absolute h-2 w-2 rounded-sm"
          style={{ backgroundColor: c.color }}
        />
      ))}

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 14 }}
        className="z-10 text-center"
      >
        <p className="text-4xl font-black tracking-tight text-amber-300">
          {winner === 'mafia'
            ? `${theme.roleEmoji.mafia} ${theme.killerTeam} Win`
            : `${theme.roleEmoji.villager} Villagers Win`}
        </p>
      </motion.div>

      {(() => {
        // A player's role determines their team, not whether they personally survived — a
        // villager who died on night 1 still "wins" if the villagers ultimately do.
        const isWinningPlayer = (role: string | null) => (role === 'mafia') === (winner === 'mafia');
        const winners = players.filter((p) => isWinningPlayer(p.role));
        const losers = players.filter((p) => !isWinningPlayer(p.role));

        const roster = (list: typeof players, delayOffset: number, muted: boolean) => (
          <div className="grid max-w-xl grid-cols-3 gap-4 sm:grid-cols-4">
            {list.map((p, i) => (
              <motion.div
                key={p.userId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: muted ? 0.5 : 1, y: 0 }}
                transition={{ delay: delayOffset + i * 0.05 }}
                className={`flex flex-col items-center gap-1 text-center ${muted ? 'grayscale' : ''}`}
              >
                <Avatar id={p.userId} name={p.displayName} size="lg" />
                <p className="text-xs text-slate-300">{p.displayName}</p>
                {p.role && (
                  <p className={`text-[11px] font-semibold ${ROLE_COLORS[p.role] ?? 'text-slate-400'}`}>
                    {theme.roleEmoji[p.role as Role] ?? ''} {theme.roleLabels[p.role as Role] ?? p.role}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        );

        return (
          <div className="z-10 mt-8 space-y-6">
            <div>
              <p className="mb-3 text-center text-xs font-semibold tracking-wide text-amber-300 uppercase">
                🏆 Winners
              </p>
              {roster(winners, 0.3, false)}
            </div>
            {losers.length > 0 && (
              <div>
                <p className="mb-3 text-center text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Lost
                </p>
                {roster(losers, 0.3 + winners.length * 0.05, true)}
              </div>
            )}
          </div>
        );
      })()}

      <p className="z-10 mt-8 text-xs text-slate-500">Tap anywhere to continue</p>
    </div>
  );
}
