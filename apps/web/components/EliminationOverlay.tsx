'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Avatar } from './Avatar';
import { ROLE_COLORS, ROLE_EMOJI } from '../lib/roleTheme';

export interface EliminationInfo {
  userId: string;
  name: string;
  role: string | null;
  causeText: string;
}

export function EliminationOverlay({ info, onDismiss }: { info: EliminationInfo | null; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      {info && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-rose-950/80 backdrop-blur-sm"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="flex flex-col items-center gap-3 text-center"
          >
            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.6 }}>
              <Avatar id={info.userId} name={info.name} size="lg" state="dead" />
            </motion.div>
            <p className="text-lg font-semibold text-rose-100">{info.name}</p>
            <p className="text-sm text-rose-300/80">{info.causeText}</p>
            {info.role && (
              <motion.div
                initial={{ scaleY: 0.2, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="mt-2 rounded-xl border border-slate-700 bg-slate-900 px-6 py-3"
              >
                <p className="text-xs text-slate-400">They were the</p>
                <p className={`text-xl font-bold capitalize ${ROLE_COLORS[info.role] ?? 'text-slate-100'}`}>
                  {ROLE_EMOJI[info.role] ?? ''} {info.role}
                </p>
              </motion.div>
            )}
            <p className="mt-4 text-xs text-rose-300/50">Tap anywhere to continue</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
