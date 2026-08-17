'use client';

import { motion } from 'framer-motion';
import { ROLE_COLORS, ROLE_EMOJI } from '../lib/roleTheme';

export function RoleRevealCard({ role, onDismiss }: { role: string; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-slate-950/90 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <motion.div
        initial={{ rotateY: 180, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="w-64 rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl"
      >
        <p className="text-sm text-slate-400">Your role is</p>
        <p className="mt-2 text-5xl">{ROLE_EMOJI[role] ?? '❓'}</p>
        <p className={`mt-2 text-2xl font-bold capitalize ${ROLE_COLORS[role] ?? 'text-slate-100'}`}>{role}</p>
        <p className="mt-6 text-xs text-slate-500">Tap anywhere to continue</p>
      </motion.div>
    </motion.div>
  );
}
