"use client";

import { useEffect, useRef, useState } from "react";

const ALERT_HOURS = [9, 14, 17];

/**
 * Hook que dispara um alerta às 9:00, 14:00 e 17:00 para lembrar de atualizar dados.
 * Retorna `show` (se o banner deve ser visível) e `dismiss` (para o fechar).
 */
export function useUpdateReminder() {
  const [show, setShow] = useState(false);
  const dismissedRef = useRef<string | null>(null);

  useEffect(() => {
    function check() {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();

      // Chave única por hora alerta + dia (só dispara uma vez por slot)
      const key = `${now.toDateString()}-${h}`;

      if (ALERT_HOURS.includes(h) && m < 30 && dismissedRef.current !== key) {
        setShow(true);
      }
    }

    check();
    const interval = setInterval(check, 30_000); // verifica a cada 30s
    return () => clearInterval(interval);
  }, []);

  function dismiss() {
    const now = new Date();
    dismissedRef.current = `${now.toDateString()}-${now.getHours()}`;
    setShow(false);
  }

  return { show, dismiss };
}
