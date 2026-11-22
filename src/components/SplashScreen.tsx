import { motion } from 'motion/react';

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  return (
    <motion.div
      key="hsp-splash-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#060608] text-white overflow-hidden select-none"
    >
      {/* Subtle Gold Ambient Glow */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1.15 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
        className="pointer-events-none absolute w-[380px] h-[380px] rounded-full bg-[radial-gradient(circle,_rgba(245,158,11,0.28)_0%,_rgba(250,204,21,0.14)_45%,_transparent_72%)] blur-2xl"
      />

      {/* Logo Fade-In & Scale-Up */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          duration: 0.45,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="relative z-10 flex flex-col items-center text-center px-6"
      >
        <motion.div
          initial={{ scale: 0.88 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative p-1.5 rounded-3xl bg-gradient-to-br from-amber-500 via-yellow-400 to-amber-300 shadow-[0_0_45px_rgba(250,204,21,0.35)]"
        >
          <img
            src="/pwa-512x512.png"
            alt="HSP delivery logo"
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-[20px] object-cover block"
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35, ease: 'easeOut' }}
          className="mt-5 text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-white"
        >
          HSP{' '}
          <span className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
            delivery
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.35, ease: 'easeOut' }}
          className="mt-1.5 text-xs sm:text-sm font-semibold text-zinc-400 tracking-wide"
        >
          Hasilpur & Pakistan Multi-Store Express Delivery
        </motion.p>

        {/* Smooth Gold Progress Bar */}
        <div className="mt-6 w-44 h-1.5 rounded-full bg-zinc-900 border border-amber-500/20 overflow-hidden">
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-yellow-300"
          />
        </div>

        <button
          type="button"
          onClick={onFinish}
          className="mt-6 text-[11px] font-semibold text-zinc-500 hover:text-amber-300 transition-colors"
        >
          Tap to enter
        </button>
      </motion.div>
    </motion.div>
  );
}
