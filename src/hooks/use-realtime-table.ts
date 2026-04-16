"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

interface Options {
  orderBy?: string;
  ascending?: boolean;
  filter?: { column: string; value: string | number | boolean | null };
}

/**
 * Realtime hook genérico — para tabelas SEM campo is_completed.
 * Refetch em qualquer evento, para manter ordem e filtros.
 */
export function useRealtimeTable<T extends { id: string }>(
  table: string,
  initial: T[],
  { orderBy = "created_at", ascending = true, filter }: Options = {}
) {
  const [items, setItems] = useState<T[]>(initial);

  const refetch = useCallback(async () => {
    let q = supabase.from(table).select("*");
    if (filter) q = q.eq(filter.column, filter.value as never);
    const { data } = await q.order(orderBy, { ascending, nullsFirst: false });
    if (data) setItems(data as T[]);
  }, [table, orderBy, ascending, filter?.column, filter?.value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  useEffect(() => {
    const channel = supabase
      .channel(`${table}-rt-${filter?.value ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => { refetch(); }
      )
      .subscribe();

    const interval = setInterval(refetch, 15_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [table, refetch, filter?.value]);

  return { items, refetch, setItems };
}
