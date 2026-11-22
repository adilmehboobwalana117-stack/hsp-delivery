import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-3.5 py-2 text-xs font-extrabold text-zinc-950 shadow-lg">
      <WifiOff className="w-3.5 h-3.5" />
      Offline Mode — Showing cached HSP delivery data
    </div>
  );
};
