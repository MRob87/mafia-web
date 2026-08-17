'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface ToastMessage {
  id: number;
  text: string;
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 4500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      onClick={() => onDismiss(toast.id)}
      className="max-w-sm cursor-pointer rounded-lg border border-rose-800 bg-rose-950/95 px-4 py-3 text-sm text-rose-100 shadow-lg backdrop-blur-sm"
    >
      {toast.text}
    </motion.div>
  );
}
