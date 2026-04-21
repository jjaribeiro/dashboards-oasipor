"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface Options {
  orderBy?: string;
  ascending?: boolean;
  filter?: { column: string; value: string | number | boolean | null };
}

/**
 * Realtime hook genérico — atualiza o estado local diretamente
 * a partir dos payloads do Realtime (sem refetch completo em cada evento).
 */
export function useRealtimeTable<T extends { id: string }>(
  table: string,
  initial: T[],
  { orderBy = "created_at", ascending = true, filter }: Options = {}
) {
  const [items, setItems] = useState<T[]>(initial);
  const optionsRef = useRef({ orderBy, ascending, filter });
  optionsRef.current = { orderBy, ascending, filter };

  const refetch = useCallback(async () => {
    let q = supabase.from(table).select("*");
    const f = optionsRef.current.filter;
    if (f) q = q.eq(f.column, f.value as never);
    const { data } = await q.order(optionsRef.current.orderBy, {
      ascending: optionsRef.current.ascending,
      nullsFirst: false,
    });
    if (data) setItems(data as T[]);
  }, [table]);

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  useEffect(() => {
    function sortItems(arr: T[]) {
      const { orderBy: ob, ascending: asc } = optionsRef.current;
      return [...arr].sort((a, b) => {
        const va = (a as unknown as Record<string, unknown>)[ob];
        const vb = (b as unknown as Record<string, unknown>)[ob];
        if (va == null && vb == null) return 0;
        if (va == null) return asc ? 1 : -1;
        if (vb == null) return asc ? -1 : 1;
        const av = va as string | number;
        const bv = vb as string | number;
        if (av < bv) return asc ? -1 : 1;
        if (av > bv) return asc ? 1 : -1;
        return 0;
      });
    }

    function matchesFilter(row: Record<string, unknown>) {
      const f = optionsRef.current.filter;
      if (!f) return true;
      return row[f.column] === f.value;
    }

    function handle(payload: RealtimePostgresChangesPayload<Record<string, unknown>>) {
      const { eventType, new: newRow, old: oldRow } = payload;
      setItems((prev) => {
        if (eventType === "DELETE") {
          const id = (oldRow as { id?: string })?.id;
          if (!id) return prev;
          return prev.filter((x) => x.id !== id);
        }
        if (eventType === "INSERT") {
          if (!newRow || !matchesFilter(newRow)) return prev;
          const nr = newRow as unknown as T;
          if (prev.some((x) => x.id === nr.id)) return prev;
          return sortItems([...prev, nr]);
        }
        if (eventType === "UPDATE") {
          if (!newRow) return prev;
          const nr = newRow as unknown as T;
          // Se já não cumpre filtro, remover
          if (!matchesFilter(newRow)) return prev.filter((x) => x.id !== nr.id);
          const idx = prev.findIndex((x) => x.id === nr.id);
          if (idx === -1) return sortItems([...prev, nr]);
          // Atualizar in-place sem re-sort: evita saltos de posição ao editar campos
          const next = [...prev];
          next[idx] = nr;
          return next;
        }
        return prev;
      });
    }

    const channel = supabase
      .channel(`${table}-rt-${filter?.value ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, handle)
      .subscribe();

    // Polling de segurança muito espaçado
    const interval = setInterval(refetch, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [table, refetch, filter?.value]);

  return { items, refetch, setItems };
}
