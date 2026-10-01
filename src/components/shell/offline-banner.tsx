'use client';

import { useEffect, useRef } from 'react';
import { Mascot } from '@/components/mascot/mascot';
import { useToast } from '@/components/ui/toast';
import { useOnline } from './use-online';

/** A quiet pill while the network is down, and a short "Back online" when it returns. */
export function OfflineBanner() {
  const online = useOnline();
  const { show } = useToast();
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      show({ message: 'Back online.', durationMs: 2_500 });
    }
  }, [online, show]);
  if (online) return null;
  return <div className="offline-banner" role="status">
    <Mascot pose="sleeping" size={32} />
    <span>You are offline. Tagvico will reconnect on its own.</span>
  </div>;
}
