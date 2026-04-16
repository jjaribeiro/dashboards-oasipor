"use client";

import { useMemo, useState, useCallback } from "react";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { CardZona } from "./card-zona";
import { CardCiclo } from "./card-ciclo";
import { FormOP } from "./form-op";
import { FormCiclo } from "./form-ciclo";
import { FormEquipa } from "./form-equipa";
import { ClockDisplay } from "@/components/clock-display";
import { AREA_COR, AREA_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { EquipamentoCiclo, Funcionario, OrdemProducao, ZonaProducao } from "@/lib/types";

interface Props {
  zonas: ZonaProducao[];
  initialOPs: OrdemProducao[];
  initialCiclos: EquipamentoCiclo[];
  initialFuncionarios: Funcionario[];
  kiosk?: boolean;
}

export function ProducaoGestaoGrid({ zonas, initialOPs, initialCiclos, initialFuncionarios, kiosk = false }: Props) {
  const { items: ops } = useRealtimeTable<OrdemProducao>("ordens_producao", initialOPs, { orderBy: "updated_at", ascending: false });
  const { items: ciclos } = useRealtimeTable<EquipamentoCiclo>("equipamento_ciclo", initialCiclos, { orderBy: "updated_at", ascending: false });
  const { items: funcionarios } = useRealtimeTable<Funcionario>("funcionarios", initialFuncionarios, { orderBy: "nome" });

  // Form states
  const [opForm, setOPForm] = useState<{ open: boolean; zona: string; item: OrdemProducao | null }>({ open: false, zona: "", item: null });
  const [cicloForm, setCicloForm] = useState<{ open: boolean; zona: string; item: EquipamentoCiclo | null; isEster: boolean }>({ open: false, zona: "", item: null, isEster: false });
  const [equipaForm, setEquipaForm] = useState<{ open: boolean; zona: string }>({ open: false, zona: "" });

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

  const openOP = (item: OrdemProducao | null, zonaId: string) => setOPForm({ open: true, zona: zonaId, item });
  const openCiclo = (item: EquipamentoCiclo | null, zonaId: string) => {
    const z = zonas.find((zz) => zz.id === zonaId);
    setCicloForm({ open: true, zona: zonaId, item, isEster: z?.tipo === "esterilizador" });
  };
  const openTeam = (zonaId: string) => setEquipaForm({ open: true, zona: zonaId });

  const moveOP = useCallback(async (opId: string, novaZonaId: string) => {
    const { error } = await supabase.from("ordens_producao").update({ zona_id: novaZonaId }).eq("id", opId);
    if (error) toast.error("Erro ao mover OP");
    else toast.success("OP movida");
  }, []);

  const moveCiclo = useCallback(async (cicloId: string, novaZonaId: string) => {
    const { error } = await supabase.from("equipamento_ciclo").update({ zona_id: novaZonaId }).eq("id", cicloId);
    if (error) toast.error("Erro ao mover ciclo");
    else toast.success("Ciclo movido");
  }, []);

  return (
    <div className={cn("flex h-full flex-col", kiosk && "kiosk")}>
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

      <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-hidden p-3">
        {/* Produção: 4 colunas — SL1 | SL2 Picking | SL2 Linhas (Assembling+Termo) | Embalamento */}
        <div className="flex min-h-0 flex-[3] flex-col">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {porArea.sala_limpa_1 && <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", AREA_COR.sala_limpa_1)}>{AREA_LABEL.sala_limpa_1}</span>}
              {porArea.sala_limpa_2 && <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", AREA_COR.sala_limpa_2)}>{AREA_LABEL.sala_limpa_2}</span>}
              {porArea.embalamento && <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", AREA_COR.embalamento)}>{AREA_LABEL.embalamento}</span>}
            </div>
            <button
              onClick={() => openOP(null, "")}
              className="rounded-md bg-slate-900 px-3 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-700"
            >
              + Adicionar OP
            </button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-4 gap-2">
            {/* SL1 */}
            {(porArea.sala_limpa_1 ?? []).map((z) => (
              <CardZona
                key={z.id}
                zona={z}
                ordens={opsPorZona[z.id] ?? []}
                funcionarios={funcionarios}
                onOpenOP={openOP}
                onOpenTeam={openTeam}
                onMoveOP={moveOP}
                kiosk={kiosk}
              />
            ))}
            {/* SL2 Picking */}
            {(porArea.sala_limpa_2 ?? []).filter((z) => z.tipo === "picking").map((z) => (
              <CardZona
                key={z.id}
                zona={z}
                ordens={opsPorZona[z.id] ?? []}
                funcionarios={funcionarios}
                onOpenOP={openOP}
                onOpenTeam={openTeam}
                onMoveOP={moveOP}
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
                  onOpenOP={openOP}
                  onOpenTeam={openTeam}
                  onMoveOP={moveOP}
                  kiosk={kiosk}
                  showLinhaBadge
                />
              );
            })()}
            {/* Embalamento */}
            {(porArea.embalamento ?? []).map((z) => (
              <CardZona
                key={z.id}
                zona={z}
                ordens={opsPorZona[z.id] ?? []}
                funcionarios={funcionarios}
                onOpenOP={openOP}
                onOpenTeam={openTeam}
                onMoveOP={moveOP}
                kiosk={kiosk}
              />
            ))}
          </div>
        </div>

        {/* Esterilização: 5 câmaras — mais curto */}
        {porArea.esterilizacao && (
          <div className="flex min-h-0 flex-[1] flex-col">
            <div className="mb-1 flex items-center justify-between">
              <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", AREA_COR.esterilizacao)}>{AREA_LABEL.esterilizacao}</span>
              <button
                onClick={() => openCiclo(null, porArea.esterilizacao![0].id)}
                className="rounded-md bg-slate-900 px-3 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-700"
              >
                + Carregar Ciclo
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-5 gap-2">
              {porArea.esterilizacao.map((z) => (
                <CardCiclo
                  key={z.id}
                  zona={z}
                  ciclo={cicloPorZona[z.id]}
                  onOpenCiclo={openCiclo}
                  onMoveCiclo={moveCiclo}
                  kiosk={kiosk}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {opForm.open && (
        <FormOP
          open={opForm.open}
          onOpenChange={(o) => setOPForm((s) => ({ ...s, open: o }))}
          editItem={opForm.item}
          defaultZona={opForm.zona}
        />
      )}
      {cicloForm.open && (
        <FormCiclo
          open={cicloForm.open}
          onOpenChange={(o) => setCicloForm((s) => ({ ...s, open: o }))}
          editItem={cicloForm.item}
          zonaId={cicloForm.zona}
          isEsterilizador={cicloForm.isEster}
        />
      )}
      {equipaForm.open && (
        <FormEquipa
          open={equipaForm.open}
          onOpenChange={(o) => setEquipaForm((s) => ({ ...s, open: o }))}
          zonaId={equipaForm.zona}
          funcionarios={funcionarios}
          responsavel={zonas.find((z) => z.id === equipaForm.zona)?.responsavel}
        />
      )}
    </div>
  );
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
