"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Auto-refresh invisível — chama router.refresh() periodicamente
 * para re-buscar dados do servidor sem perder estado do cliente.
 * Também usa Wake Lock API para impedir o ecrã de entrar em standby.
 * Ideal para Smart TVs onde WebSockets podem não funcionar bem.
 */
export function AutoRefresh({ intervalSeconds = 30 }: { intervalSeconds?: number }) {
  const router = useRouter();
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  // Auto-refresh
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalSeconds * 1000);

    return () => clearInterval(id);
  }, [router, intervalSeconds]);

  // Wake Lock — impede standby da TV
  useEffect(() => {
    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLock.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Wake Lock não suportado ou recusado — ignorar
      }
    }

    requestWakeLock();

    // Re-adquirir wake lock quando a tab volta a ficar visível
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (wakeLock.current) {
        wakeLock.current.release();
        wakeLock.current = null;
      }
    };
  }, []);

  return null;
}
