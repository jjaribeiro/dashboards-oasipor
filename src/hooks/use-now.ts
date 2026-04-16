"use client";

import { useEffect, useState } from "react";

/** Hook que retorna Date.now() e re-renderiza periodicamente. */
export function useNow(intervalMs: number = 30_000) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
