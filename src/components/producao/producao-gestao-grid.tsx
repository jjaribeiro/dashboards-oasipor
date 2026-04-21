"use client";

import { useMemo, useState, useCallback } from "react";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { useAutoMoveCiclos } from "@/hooks/use-auto-move-ciclos";
import { useDelayAlert } from "@/hooks/use-delay-alert";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { CardZona } from "./card-zona";
import { CardCiclo } from "./card-ciclo";
import { FormCiclo } from "./form-ciclo";
import { ClockDisplay } from "@/components/clock-display";
import { AREA_COR, AREA_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { EquipamentoCiclo, Funcionario, OrdemProducao, ZonaProducao } from "@/lib/types";

interface Props {
  initialZonas: ZonaProducao[];
  initialOPs: OrdemProducao[];
  initialCiclos: EquipamentoCiclo[];
  initialFuncionarios: Funcionario[];
  kiosk?: boolean;
}

export function ProducaoGestaoGrid({ initialZonas, initialOPs, initialCiclos, initialFuncionarios, kiosk = false }: Props) {
  const { items: zonas } = useRealtimeTable<ZonaProducao>("zonas_producao", initialZonas, { orderBy: "ordem" });
  const { items: opsRaw, setItems: setOps } = useRealtimeTable<OrdemProducao>("ordens_producao", initialOPs, { orderBy: "updated_at", ascending: false });
  const { items: ciclos, setItems: setCiclos } = useRealtimeTable<EquipamentoCiclo>("equipamento_ciclo", initialCiclos, { orderBy: "updated_at", ascending: false });
  const { items: funcionarios } = useRealtimeTable<Funcionario>("funcionarios", initialFuncionarios, { orderBy: "nome" });

  // Semana actual (seg → sex) — mostra só OPs planeadas/em curso com overlap neste intervalo
  const { weekStart, weekEnd, weekDays } = useMemo(() => {
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    const day = base.getDay() || 7;
    base.setDate(base.getDate() - (day - 1));
    const end = new Date(base);
    end.setDate(end.getDate() + 5); // seg 12:00 → sáb 12:00 (cobre seg-sex)
    const days = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      return d;
    });
    return { weekStart: base, weekEnd: end, weekDays: days };
  }, []);

  // Filtrar concluidas/canceladas + restringir à semana actual
  const ops = useMemo(() => opsRaw.filter((o) => {
    if (o.estado === "concluida" || o.estado === "cancelada") return false;
    const ini = o.inicio_previsto ? new Date(o.inicio_previsto) : null;
    const fim = o.fim_previsto ? new Date(o.fim_previsto) : ini;
    // Sem datas → não cabe nesta visão semanal
    if (!ini || !fim) return false;
    // Overlap: OP começa antes do fim da semana E acaba depois do início
    return ini < weekEnd && fim >= weekStart;
  }), [opsRaw, weekStart, weekEnd]);

  // Optimistic update helpers (só para ciclos — OPs são geridas no Planeamento)
  function patchCiclo(id: string, patch: Partial<EquipamentoCiclo>) {
    setCiclos((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  }

  // Auto-move ciclos de esterilização
  useAutoMoveCiclos(ciclos);

  // Form states — só ciclos são editáveis aqui; OPs e equipas são geridas no Planeamento
  const [cicloForm, setCicloForm] = useState<{ open: boolean; zona: string; item: EquipamentoCiclo | null }>({ open: false, zona: "", item: null });

  // Grouping
  const porArea = useMemo(() => {
    const groups: Record<string, ZonaProducao[]> = {};
    zonas.forEach((z) => {
      if (!groups[z.area]) groups[z.area] = [];
      groups[z.area].push(z);
    });
    return groups;
  }, [zonas]);

  const opsPorZona = useMemo(() => {
    const map: Record<string, OrdemProducao[]> = {};
    ops.forEach((o) => {
      if (!map[o.zona_id]) map[o.zona_id] = [];
      map[o.zona_id].push(o);
    });
    return map;
  }, [ops]);

  // Último ciclo (mais recente) por zona
  const cicloPorZona = useMemo(() => {
    const map: Record<string, EquipamentoCiclo> = {};
    ciclos.forEach((c) => {
      const prev = map[c.zona_id];
      if (!prev || new Date(c.updated_at).getTime() > new Date(prev.updated_at).getTime()) {
        map[c.zona_id] = c;
      }
    });
    return map;
  }, [ciclos]);

  // Stats
  const opsEmCurso = ops.filter((o) => o.estado === "em_curso").length;
  const opsAtraso = ops.filter((o) => o.estado === "em_curso" && o.fim_previsto && new Date(o.fim_previsto) < new Date()).length;
  const ciclosAlarme = ciclos.filter((c) => c.estado === "alarme").length;

  const openCiclo = (item: EquipamentoCiclo | null, zonaId: string) => {
    setCicloForm({ open: true, zona: zonaId, item });
  };

  const moveCiclo = useCallback((cicloId: string, novaZonaId: string) => {
    patchCiclo(cicloId, { zona_id: novaZonaId as EquipamentoCiclo["zona_id"] });
    toast.success("Ciclo movido");
    supabase.from("equipamento_ciclo").update({ zona_id: novaZonaId }).eq("id", cicloId)
      .then(({ error }) => { if (error) toast.error("Erro ao mover ciclo"); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={cn("flex flex-col overflow-hidden", kiosk && "kiosk")}
      style={{ height: "100vh" }}
    >
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-2 text-slate-500 transition-colors hover:text-slate-900" title="Voltar ao hub">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-oasipor.png" alt="Oasipor" className={kiosk ? "h-20" : "h-14"} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <h1 className={cn("font-extrabold text-slate-900", kiosk ? "text-3xl" : "text-xl")}>
            Produção — Gestão
          </h1>
          <div className="ml-4 flex items-center gap-2">
            <Stat label="OPs em curso" value={opsEmCurso} color="emerald" />
            {opsAtraso > 0 && <Stat label="OPs em atraso" value={opsAtraso} color="red" flash />}
            {ciclosAlarme > 0 && <Stat label="Alarmes" value={ciclosAlarme} color="red" flash />}
          </div>
        </div>
        <ClockDisplay />
      </header>

      {/* Barra semana — exibição (Seg → Sex) */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-6 py-1.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Semana</span>
        <span className="text-sm font-black text-slate-900">
          {fmtDiaMes(weekDays[0])} — {fmtDiaMes(weekDays[4])}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {weekDays.map((d, i) => {
            const hoje = isSameDay(d, new Date());
            return (
              <span
                key={i}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-extrabold",
                  hoje ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-600 border border-slate-200"
                )}
              >
                {DIAS_SEMANA[i]} {fmtDiaMes(d)}
              </span>
            );
          })}
        </div>
      </div>


      <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-hidden p-3">
        {/* Produção: 4 colunas — SL1 (combinado) | SASC Picking | SL2 Linhas | SL2 Embalamento */}
        <div className="flex min-h-0 flex-[3] flex-col">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {porArea.sala_limpa_1 && <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", AREA_COR.sala_limpa_1)}>{AREA_LABEL.sala_limpa_1}</span>}
              {porArea.sala_limpa_2 && <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", AREA_COR.sala_limpa_2)}>{AREA_LABEL.sala_limpa_2}</span>}
            </div>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-1 gap-2 overflow-hidden">
            {/* SL1 combinado — todas as 5 sub-zonas num card só, com sticker da sub-zona por OP */}
            {(() => {
              const sl1 = porArea.sala_limpa_1 ?? [];
              const principal = sl1[0];
              const extra = sl1.slice(1);
              if (!principal) return null;
              const ordensSl1 = sl1.flatMap((z) => opsPorZona[z.id] ?? []);
              return (
                <CardZona
                  key="sl1-combinado"
                  zona={{ ...principal, nome: "SL1", responsavel: principal.responsavel }}
                  zonasExtra={extra}
                  ordens={ordensSl1}
                  funcionarios={funcionarios}
                  readOnly
                  kiosk={kiosk}
                  showLinhaBadge
                />
              );
            })()}
            {/* SASC Picking */}
            {(porArea.sala_limpa_2 ?? []).filter((z) => z.tipo === "picking").map((z) => (
              <CardZona
                key={z.id}
                zona={z}
                ordens={opsPorZona[z.id] ?? []}
                funcionarios={funcionarios}
                readOnly
                kiosk={kiosk}
              />
            ))}
            {/* SL2 Linhas (Manual + Termoformadora combinadas) */}
            {(() => {
              const linhas = (porArea.sala_limpa_2 ?? []).filter((z) => z.tipo === "linha");
              const principal = linhas[0];
              const extra = linhas.slice(1);
              if (!principal) return null;
              const ordensLinhas = linhas.flatMap((z) => opsPorZona[z.id] ?? []);
              return (
                <CardZona
                  key="sl2-linhas"
                  zona={{ ...principal, nome: "SL2 — Linhas", responsavel: principal.responsavel }}
                  zonasExtra={extra}
                  ordens={ordensLinhas}
                  funcionarios={funcionarios}
                  readOnly
                  kiosk={kiosk}
                  showLinhaBadge
                />
              );
            })()}
            {/* SL2 Embalamento */}
            {(porArea.sala_limpa_2 ?? []).filter((z) => z.id === "sl2_embalamento").map((z) => (
              <CardZona
                key={z.id}
                zona={z}
                ordens={opsPorZona[z.id] ?? []}
                funcionarios={funcionarios}
                readOnly
                kiosk={kiosk}
              />
            ))}
          </div>
        </div>

        {/* Esterilização: 5 câmaras — mais curto */}
        {porArea.esterilizacao && (
          <div className="flex min-h-0 flex-[1] flex-col">
            <div className="mb-1 flex items-center">
              <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", AREA_COR.esterilizacao)}>{AREA_LABEL.esterilizacao}</span>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-5 gap-2">
              {porArea.esterilizacao.map((z) => (
                <CardCiclo
                  key={z.id}
                  zona={z}
                  ciclo={cicloPorZona[z.id]}
                  onMoveCiclo={moveCiclo}
                  kiosk={kiosk}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {cicloForm.open && (
        <FormCiclo
          open={cicloForm.open}
          onOpenChange={(o) => setCicloForm((s) => ({ ...s, open: o }))}
          editItem={cicloForm.item}
          zonaId={cicloForm.zona}
        />
      )}
    </div>
  );
}


const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex"];
function fmtDiaMes(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function Stat({ label, value, color, flash }: { label: string; value: number; color: "emerald" | "red" | "slate"; flash?: boolean }) {
  const cls =
    color === "red" ? "bg-red-100 text-red-700 border-red-200" :
    color === "emerald" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <div className={cn("rounded-lg border px-3 py-1 text-sm font-extrabold", cls, flash && "banner-flash")}>
      <span className="mr-1 text-lg">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
