"use client";

import { useEffect, useRef } from "react";

/**
 * Toca um beep e faz flash no <title> quando há OPs em atraso.
 */
export function useDelayAlert(numAtrasadas: number, enabled: boolean = true) {
  const prev = useRef(numAtrasadas);
  const originalTitle = useRef<string>("");

  useEffect(() => {
    if (typeof document !== "undefined") {
      originalTitle.current = document.title;
    }
  }, []);

  // Beep quando o número de atrasadas aumenta
  useEffect(() => {
    if (!enabled) return;
    if (numAtrasadas > prev.current) {
      playBeep();
    }
    prev.current = numAtrasadas;
  }, [numAtrasadas, enabled]);

  // Flash no título se houver atrasadas
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    if (numAtrasadas === 0) {
      document.title = originalTitle.current || document.title;
      return;
    }
    let flipped = false;
    const id = setInterval(() => {
      flipped = !flipped;
      document.title = flipped
        ? `⚠ ${numAtrasadas} ATRASADA${numAtrasadas > 1 ? "S" : ""}`
        : originalTitle.current || "Dashboard";
    }, 1000);
    return () => {
      clearInterval(id);
      document.title = originalTitle.current || document.title;
    };
  }, [numAtrasadas, enabled]);
}

function playBeep() {
  try {
    const AudioCtor: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 500);
  } catch {
    // silently fail — mobile browsers need user interaction
  }
}
