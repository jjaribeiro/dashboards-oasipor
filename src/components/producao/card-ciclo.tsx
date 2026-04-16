"use client";

import { useRef, useState } from "react";
import { cn, cycleProgress, formatDuration, minutesUntil } from "@/lib/utils";
import { ESTADO_CICLO_COR, ESTADO_CICLO_LABEL, ZONA_LABEL } from "@/lib/constants";
import { useNow } from "@/hooks/use-now";
import type { EquipamentoCiclo, PaleteDetalhe, ZonaProducao } from "@/lib/types";

interface CardCicloProps {
  zona: ZonaProducao;
  ciclo?: EquipamentoCiclo;
  onOpenCiclo?: (ciclo: EquipamentoCiclo | null, zonaId: string) => void;
  onMoveCiclo?: (cicloId: string, novaZonaId: string) => void;
  kiosk?: boolean;
}

export function CardCiclo({ zona, ciclo, onOpenCiclo, onMoveCiclo, kiosk }: CardCicloProps) {
  useNow(30_000); // re-render a cada 30s
  const estado = ciclo?.estado ?? "vazio";
  const progress = ciclo ? cycleProgress(ciclo.inicio, ciclo.fim_previsto) : 0;
  const restante = ciclo ? minutesUntil(ciclo.fim_previsto) : null;
  const atraso = restante !== null && restante < 0;
  const isEster = zona.tipo === "esterilizador";

  // Drag & drop
  const dragCounter = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    setDragOver(true);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function handleDragLeave() {
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false); }
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const cicloId = e.dataTransfer.getData("application/ciclo-id");
    const fromZona = e.dataTransfer.getData("application/ciclo-from-zona");
    if (cicloId && fromZona !== zona.id && onMoveCiclo) {
      onMoveCiclo(cicloId, zona.id);
    }
  }
  function handleDragStart(e: React.DragEvent) {
    if (!ciclo) { e.preventDefault(); return; }
    e.dataTransfer.setData("application/ciclo-id", ciclo.id);
    e.dataTransfer.setData("application/ciclo-from-zona", zona.id);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div
      draggable={!!ciclo}
      onDragStart={handleDragStart}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onOpenCiclo ? () => onOpenCiclo(ciclo ?? null, zona.id) : undefined}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all",
        dragOver ? "border-blue-400 ring-2 ring-blue-200 bg-blue-50/30" : "",
        ciclo && "cursor-grab active:cursor-grabbing active:opacity-60",
        onOpenCiclo && "hover:shadow-md",
        estado === "alarme" && "border-red-300 ring-2 ring-red-200",
        estado === "em_ciclo" && "border-emerald-200",
        estado === "concluido" && "border-blue-200",
        estado === "vazio" && "border-slate-200"
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className={cn("truncate font-extrabold text-slate-900", kiosk ? "text-base" : "text-sm")}>
          {ZONA_LABEL[zona.id] ?? zona.nome}
        </h3>
        <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold", ESTADO_CICLO_COR[estado])}>
          {ESTADO_CICLO_LABEL[estado]}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-2 p-3">
        {ciclo && ciclo.conteudo && (
          <p className="truncate text-xs font-bold text-slate-700">{ciclo.conteudo}</p>
        )}

        {/* Grelha de paletes */}
        {ciclo?.paletes_detalhe && ciclo.paletes_detalhe.length > 0 && (
          <PaletesMiniGrid paletes={ciclo.paletes_detalhe} capacidade={isEster ? 8 : undefined} />
        )}


        {estado === "em_ciclo" && ciclo?.inicio && ciclo?.fim_previsto && (
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-500" suppressHydrationWarning>
                Restante:{" "}
                <span className={cn(atraso ? "text-red-600" : "text-slate-900")}>
                  {restante !== null ? (atraso ? `+${formatDuration(-restante)}` : formatDuration(restante)) : "—"}
                </span>
              </span>
              <span className="text-slate-500" suppressHydrationWarning>{Math.round(progress * 100)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                suppressHydrationWarning
                className={cn("h-full rounded-full transition-all", atraso ? "bg-red-500" : "bg-emerald-500")}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {estado === "vazio" && (
          <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs font-bold text-slate-400">
            Carregar ciclo
          </div>
        )}

        {estado === "concluido" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-center text-xs font-bold text-blue-700">
            ✓ Ciclo concluído — pronto a descarregar
          </div>
        )}

        {estado === "alarme" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-center text-xs font-extrabold text-red-700">
            ⚠ ALARME
          </div>
        )}
      </div>
    </div>
  );
}

function PaletesMiniGrid({ paletes, capacidade }: { paletes: PaleteDetalhe[]; capacidade?: number }) {
  const total = capacidade ?? Math.max(paletes.length, 1);
  const byPos = new Map<number, PaleteDetalhe>();
  paletes.forEach((p) => byPos.set(p.posicao, p));
  const slots = Array.from({ length: total }, (_, i) => byPos.get(i + 1) ?? null);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
        Paletes <span className="text-slate-900">{paletes.length}</span>/{total}
      </div>
      <div className="grid flex-1 grid-cols-4 gap-0.5">
        {slots.map((p, i) => (
          <div
            key={i}
            title={p ? `P${p.posicao}: ${p.conteudo}${p.op_numero ? ` (${p.op_numero})` : ""}${p.quantidade ? ` — ${p.quantidade}un` : ""}${p.cliente ? ` · ${p.cliente}` : ""}` : `P${i + 1}: vazio`}
            className={cn(
              "flex h-5 items-center justify-center rounded text-[9px] font-extrabold",
              p ? "bg-emerald-500 text-white shadow-sm" : "border border-dashed border-slate-300 bg-slate-50 text-slate-400"
            )}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
