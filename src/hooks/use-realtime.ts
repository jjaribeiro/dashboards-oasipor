"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TableName } from "@/lib/types";

export function useRealtime<T extends { id: string; is_completed: boolean }>(
  table: TableName,
  initialData: T[],
  orderBy: string = "created_at"
) {
  const [items, setItems] = useState<T[]>(initialData);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from(table)
      .select("*")
      .eq("is_completed", false)
      .order(orderBy, { ascending: true, nullsFirst: false });
    if (data) setItems(data as T[]);
  }, [table, orderBy]);

  useEffect(() => {
    setItems(initialData);
  }, [initialData]);

  useEffect(() => {
    const channel = supabase
      .channel(`${table}-changes`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newItem = payload.new as T;
            if (!newItem.is_completed) {
              // Refetch to maintain sort order
              refetch();
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as T;
            if (updated.is_completed) {
              setItems((prev) => prev.filter((item) => item.id !== updated.id));
            } else {
              // Refetch to maintain sort order
              refetch();
            }
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: string };
            setItems((prev) => prev.filter((item) => item.id !== deleted.id));
          }
        }
      )
      .subscribe();

    // Fallback refetch every 60s
    const interval = setInterval(refetch, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [table, refetch]);

  return { items, refetch };
}
