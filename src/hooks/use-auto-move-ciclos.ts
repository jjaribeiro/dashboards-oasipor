"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { DURACAO_DEFAULT_MIN } from "@/lib/constants";
import { toast } from "sonner";
import type { EquipamentoCiclo } from "@/lib/types";

/**
 * Auto-move de ciclos de esterilização quando o tempo expira:
 *   Pré-Cond 1/2 → Esterilizador
 *   Esterilizador → Arejamento 1/2 (conforme arejamento_destino)
 *   Arejamento 1/2 → Concluído
 *
 * Verifica a cada 30 segundos.
 */
export function useAutoMoveCiclos(ciclos: EquipamentoCiclo[]) {
  const processing = useRef(false);

  useEffect(() => {
    async function check() {
      if (processing.current) return;
      processing.current = true;

      const now = Date.now();

      for (const c of ciclos) {
        if (c.estado !== "em_ciclo" || !c.fim_previsto) continue;
        const fimTs = new Date(c.fim_previsto).getTime();
        if (fimTs > now) continue; // ainda não expirou

        // Ciclo expirado — determinar próximo passo
        const zona = c.zona_id;

        if (zona === "pre_cond_1" || zona === "pre_cond_2") {
          // Pré-Cond → Esterilizador
          const duracaoEster = DURACAO_DEFAULT_MIN.esterilizador ?? 360;
          const novoInicio = new Date().toISOString();
          const novoFim = new Date(Date.now() + duracaoEster * 60_000).toISOString();

          const { error } = await supabase.from("equipamento_ciclo").update({
            zona_id: "esterilizador",
            inicio: novoInicio,
            fim_previsto: novoFim,
            fim_real: null,
          }).eq("id", c.id);

          if (!error) toast.info(`Ciclo movido para Esterilizador automaticamente`);
        } else if (zona === "esterilizador") {
          // Esterilizador → Arejamento
          const destino = c.arejamento_destino ?? "arejamento_1";
          const duracaoArej = DURACAO_DEFAULT_MIN[destino] ?? 1440;
          const novoInicio = new Date().toISOString();
          const novoFim = new Date(Date.now() + duracaoArej * 60_000).toISOString();

          const { error } = await supabase.from("equipamento_ciclo").update({
            zona_id: destino,
            inicio: novoInicio,
            fim_previsto: novoFim,
            fim_real: null,
          }).eq("id", c.id);

          if (!error) toast.info(`Ciclo movido para ${destino === "arejamento_1" ? "Arejamento 1" : "Arejamento 2"} automaticamente`);
        } else if (zona === "arejamento_1" || zona === "arejamento_2") {
          // Arejamento → Concluído
          const { error } = await supabase.from("equipamento_ciclo").update({
            estado: "concluido",
            fim_real: new Date().toISOString(),
          }).eq("id", c.id);

          if (!error) toast.success(`Ciclo de esterilização concluído!`);
        }
      }

      processing.current = false;
    }

    check(); // check imediato
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [ciclos]);
}
