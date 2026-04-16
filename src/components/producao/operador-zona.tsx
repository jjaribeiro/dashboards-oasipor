"use client";

import { useState } from "react";
import Link from "next/link";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { useNow } from "@/hooks/use-now";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ClockDisplay } from "@/components/clock-display";
import { FormOP } from "./form-op";
import { FormCiclo } from "./form-ciclo";
import { FormEquipa } from "./form-equipa";
import { ESTADO_OP_COR, ESTADO_OP_LABEL, PRIORIDADE_OP_COR, ZONA_LABEL, ESTADO_CICLO_COR, ESTADO_CICLO_LABEL } from "@/lib/constants";
import { cn, cycleProgress, formatDuration, minutesUntil } from "@/lib/utils";
import type { EquipamentoCiclo, Funcionario, OrdemProducao, PaleteDetalhe, ZonaProducao } from "@/lib/types";

interface Props {
  zona: ZonaProducao;
  initialOPs: OrdemProducao[];
  initialCiclos: EquipamentoCiclo[];
  initialFuncionarios: Funcionario[];
}

export function OperadorZona({ zona, initialOPs, initialCiclos, initialFuncionarios }: Props) {
  useNow(20_000);
  const isCiclo = zona.tipo === "camara" || zona.tipo === "esterilizador";

  const { items: ops } = useRealtimeTable<OrdemProducao>("ordens_producao", initialOPs, {
    orderBy: "updated_at",
    ascending: false,
    filter: { column: "zona_id", value: zona.id },
  });
  const { items: ciclos } = useRealtimeTable<EquipamentoCiclo>("equipamento_ciclo", initialCiclos, {
    orderBy: "updated_at",
    ascending: false,
    filter: { column: "zona_id", value: zona.id },
  });
  const { items: funcionarios } = useRealtimeTable<Funcionario>("funcionarios", initialFuncionarios, { orderBy: "nome" });

  const [opForm, setOPForm] = useState<{ open: boolean; item: OrdemProducao | null }>({ open: false, item: null });
  const [cicloForm, setCicloForm] = useState<{ open: boolean; item: EquipamentoCiclo | null }>({ open: false, item: null });
  const [equipaForm, setEquipaForm] = useState(false);

  const atual = ops.find((o) => o.estado === "em_curso") ?? ops.find((o) => o.estado === "pausada") ?? null;
  const proxima = ops.find((o) => o.estado === "planeada");
  const equipa = funcionarios.filter((f) => f.zona_atual === zona.id);
  const ciclo = ciclos[0];

  async function updateQty(delta: number) {
    if (!atual) return;
    const nova = Math.max(0, atual.quantidade_atual + delta);
    const { error } = await supabase.from("ordens_producao").update({ quantidade_atual: nova }).eq("id", atual.id);
    if (error) toast.error("Erro a atualizar quantidade");
  }

  async function iniciar(op: OrdemProducao) {
    const { error } = await supabase
      .from("ordens_producao")
      .update({ estado: "em_curso", inicio: op.inicio ?? new Date().toISOString() })
      .eq("id", op.id);
    if (error) toast.error("Erro"); else toast.success("OP iniciada");
  }

  async function pausar(op: OrdemProducao) {
    const { error } = await supabase.from("ordens_producao").update({ estado: "pausada" }).eq("id", op.id);
    if (error) toast.error("Erro"); else toast.success("OP pausada");
  }

  async function concluir(op: OrdemProducao) {
    const { error } = await supabase
      .from("ordens_producao")
      .update({ estado: "concluida", fim_real: new Date().toISOString() })
      .eq("id", op.id);
    if (error) toast.error("Erro"); else toast.success("OP concluída");
  }

  return (
    <div className="flex h-full flex-col">
      {/* HEADER enorme */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/producao/operador" className="flex items-center gap-2 text-slate-500 transition-colors hover:text-slate-900">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">{ZONA_LABEL[zona.id] ?? zona.nome}</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setEquipaForm(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            👥 Equipa ({equipa.length})
          </button>
          <ClockDisplay />
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto bg-slate-50 p-6">
        {/* EQUIPA presente */}
        {equipa.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Equipa presente:</span>
            {equipa.map((f) => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-extrabold text-white shadow-sm"
                style={{ backgroundColor: f.cor ?? "#64748b" }}
              >
                <span className="rounded-full bg-white/30 px-1.5 py-0.5 text-[10px]">{f.iniciais}</span>
                {f.nome}
              </span>
            ))}
          </div>
        )}

        {isCiclo ? (
          /* ============ VISTA CICLO (câmaras / esterilizador) ============ */
          <CicloPanel ciclo={ciclo} zona={zona} onOpen={(c) => setCicloForm({ open: true, item: c })} />
        ) : (
          /* ============ VISTA OPs ============ */
          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            {/* OP ATUAL — o grande */}
            {atual ? (
              <OPAtual
                op={atual}
                onIncrement={() => updateQty(1)}
                onIncrement5={() => updateQty(5)}
                onIncrement10={() => updateQty(10)}
                onDecrement={() => updateQty(-1)}
                onPause={() => pausar(atual)}
                onStart={() => iniciar(atual)}
                onEnd={() => concluir(atual)}
                onEdit={() => setOPForm({ open: true, item: atual })}
              />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-16 text-center">
                <p className="text-3xl font-black text-slate-400">Sem OP em curso</p>
                <p className="mt-2 text-sm font-bold text-slate-500">Inicia ou cria uma nova ordem de produção</p>
                <button
                  onClick={() => setOPForm({ open: true, item: null })}
                  className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 text-lg font-extrabold text-white shadow-md transition-colors hover:bg-emerald-700"
                >
                  + Nova OP
                </button>
              </div>
            )}

            {/* Coluna lateral */}
            <aside className="space-y-4">
              {proxima && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Próxima OP</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{proxima.produto_nome}</p>
                  <p className="text-sm font-bold text-slate-500">
                    {proxima.quantidade_alvo} un {proxima.numero && `· OP ${proxima.numero}`}
                  </p>
                  <button
                    onClick={() => iniciar(proxima)}
                    className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-slate-700"
                  >
                    ▶ Iniciar
                  </button>
                </div>
              )}

              <button
                onClick={() => setOPForm({ open: true, item: null })}
                className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-base font-extrabold text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
              >
                + Nova OP
              </button>

              {ops.filter((o) => o.id !== atual?.id && o.id !== proxima?.id).length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Fila de espera</p>
                  <ul className="mt-2 space-y-1">
                    {ops.filter((o) => o.id !== atual?.id && o.id !== proxima?.id).slice(0, 4).map((o) => (
                      <li
                        key={o.id}
                        onClick={() => setOPForm({ open: true, item: o })}
                        className="flex cursor-pointer items-center justify-between rounded-lg bg-slate-50 px-2 py-1 hover:bg-slate-100"
                      >
                        <span className="truncate text-sm font-bold text-slate-700">{o.produto_nome}</span>
                        <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold", ESTADO_OP_COR[o.estado])}>
                          {ESTADO_OP_LABEL[o.estado]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>

      {opForm.open && (
        <FormOP
          open={opForm.open}
          onOpenChange={(o) => setOPForm((s) => ({ ...s, open: o }))}
          editItem={opForm.item}
          defaultZona={zona.id}
        />
      )}
      {cicloForm.open && (
        <FormCiclo
          open={cicloForm.open}
          onOpenChange={(o) => setCicloForm((s) => ({ ...s, open: o }))}
          editItem={cicloForm.item}
          zonaId={zona.id}
          isEsterilizador={zona.tipo === "esterilizador"}
        />
      )}
      {equipaForm && (
        <FormEquipa
          open={equipaForm}
          onOpenChange={setEquipaForm}
          zonaId={zona.id}
          funcionarios={funcionarios}
        />
      )}
    </div>
  );
}

function OPAtual({ op, onIncrement, onIncrement5, onIncrement10, onDecrement, onPause, onStart, onEnd, onEdit }: {
  op: OrdemProducao;
  onIncrement: () => void;
  onIncrement5: () => void;
  onIncrement10: () => void;
  onDecrement: () => void;
  onPause: () => void;
  onStart: () => void;
  onEnd: () => void;
  onEdit: () => void;
}) {
  const pct = op.quantidade_alvo > 0 ? Math.min(100, (op.quantidade_atual / op.quantidade_alvo) * 100) : 0;
  const restante = minutesUntil(op.fim_previsto);
  const atraso = restante !== null && restante < 0;

  return (
    <div className="rounded-2xl border-2 border-emerald-300 bg-white p-6 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("rounded-md border px-2 py-0.5 text-xs font-extrabold", ESTADO_OP_COR[op.estado])}>
              {ESTADO_OP_LABEL[op.estado]}
            </span>
            {op.prioridade !== "normal" && (
              <span className={cn("rounded-md border px-2 py-0.5 text-xs font-extrabold capitalize", PRIORIDADE_OP_COR[op.prioridade])}>
                {op.prioridade}
              </span>
            )}
            {op.numero && <span className="text-sm font-bold text-slate-500">OP {op.numero}</span>}
          </div>
          <h2 className="mt-1 text-4xl font-black text-slate-900">{op.produto_nome}</h2>
        </div>
        <button
          onClick={onEdit}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          Editar
        </button>
      </div>

      {/* Contador gigante */}
      <div className="mt-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Quantidade</p>
          <p className="mt-1 font-black text-slate-900">
            <span className="text-7xl">{op.quantidade_atual}</span>
            <span className="ml-2 text-3xl text-slate-400">/ {op.quantidade_alvo}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Tempo</p>
          <p className={cn("mt-1 text-4xl font-black", atraso ? "text-red-600" : "text-slate-900")}>
            {restante !== null ? (atraso ? `+${formatDuration(-restante)}` : formatDuration(restante)) : "—"}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {op.quantidade_alvo > 0 && (
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* Botões de incremento gigantes */}
      <div className="mt-6 grid grid-cols-4 gap-2">
        <button onClick={onDecrement} className="rounded-xl bg-slate-200 py-4 text-2xl font-black text-slate-700 hover:bg-slate-300">
          −1
        </button>
        <button onClick={onIncrement} className="rounded-xl bg-emerald-600 py-4 text-2xl font-black text-white hover:bg-emerald-700">
          +1
        </button>
        <button onClick={onIncrement5} className="rounded-xl bg-emerald-500 py-4 text-2xl font-black text-white hover:bg-emerald-600">
          +5
        </button>
        <button onClick={onIncrement10} className="rounded-xl bg-emerald-500 py-4 text-2xl font-black text-white hover:bg-emerald-600">
          +10
        </button>
      </div>

      {/* Ações */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {op.estado === "em_curso" ? (
          <button onClick={onPause} className="rounded-xl bg-yellow-500 py-3 text-lg font-extrabold text-white hover:bg-yellow-600">
            ⏸ Pausar
          </button>
        ) : (
          <button onClick={onStart} className="rounded-xl bg-emerald-600 py-3 text-lg font-extrabold text-white hover:bg-emerald-700">
            ▶ Iniciar
          </button>
        )}
        <button onClick={onEnd} className="col-span-2 rounded-xl bg-blue-600 py-3 text-lg font-extrabold text-white hover:bg-blue-700">
          ✓ Concluir OP
        </button>
      </div>
    </div>
  );
}

function CicloPanel({ ciclo, zona, onOpen }: { ciclo: EquipamentoCiclo | undefined; zona: ZonaProducao; onOpen: (c: EquipamentoCiclo | null) => void }) {
  const estado = ciclo?.estado ?? "vazio";
  const progress = ciclo ? cycleProgress(ciclo.inicio, ciclo.fim_previsto) : 0;
  const restante = ciclo ? minutesUntil(ciclo.fim_previsto) : null;
  const atraso = restante !== null && restante < 0;
  const isEster = zona.tipo === "esterilizador";

  return (
    <div className={cn(
      "flex-1 rounded-2xl border-2 bg-white p-8 shadow-lg",
      estado === "alarme" && "border-red-400 ring-4 ring-red-200",
      estado === "em_ciclo" && "border-emerald-300",
      estado === "concluido" && "border-blue-300",
      estado === "vazio" && "border-slate-200"
    )}>
      <div className="flex items-center justify-between">
        <span className={cn("rounded-md border px-3 py-1 text-sm font-extrabold", ESTADO_CICLO_COR[estado])}>
          {ESTADO_CICLO_LABEL[estado]}
        </span>
        <button
          onClick={() => onOpen(ciclo ?? null)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          {ciclo ? "Atualizar" : "Carregar"}
        </button>
      </div>

      {ciclo?.conteudo && (
        <p className="mt-4 text-2xl font-black text-slate-900">{ciclo.conteudo}</p>
      )}

      {/* Paletes */}
      {ciclo?.paletes_detalhe && ciclo.paletes_detalhe.length > 0 && (
        <PaletesGrid paletes={ciclo.paletes_detalhe} capacidade={isEster ? 8 : undefined} />
      )}

      {isEster && (!ciclo?.paletes_detalhe || ciclo.paletes_detalhe.length === 0) && (
        <p className="mt-2 text-xl font-bold text-slate-600">
          Paletes: <span className="text-slate-900">{ciclo?.paletes ?? 0}</span> / 8
        </p>
      )}

      {estado === "em_ciclo" && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Tempo restante</p>
              <p className={cn("mt-1 text-5xl font-black", atraso ? "text-red-600" : "text-slate-900")}>
                {restante !== null ? (atraso ? `+${formatDuration(-restante)}` : formatDuration(restante)) : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Progresso</p>
              <p className="mt-1 text-5xl font-black text-slate-900">{Math.round(progress * 100)}%</p>
            </div>
          </div>
          <div className="mt-4 h-4 overflow-hidden rounded-full bg-slate-200">
            <div
              className={cn("h-full rounded-full transition-all", atraso ? "bg-red-500" : "bg-emerald-500")}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {estado === "vazio" && (
        <div className="mt-8 rounded-2xl border-2 border-dashed border-slate-300 p-10 text-center">
          <p className="text-2xl font-black text-slate-400">Equipamento vazio</p>
          <button
            onClick={() => onOpen(null)}
            className="mt-4 rounded-xl bg-emerald-600 px-6 py-3 text-lg font-extrabold text-white hover:bg-emerald-700"
          >
            ▶ Iniciar Ciclo
          </button>
        </div>
      )}

      {estado === "concluido" && (
        <div className="mt-8 rounded-2xl bg-blue-50 p-10 text-center">
          <p className="text-3xl font-black text-blue-700">✓ Ciclo Concluído</p>
          <p className="mt-1 text-lg font-bold text-blue-600">Pronto a descarregar</p>
        </div>
      )}
    </div>
  );
}

function PaletesGrid({ paletes, capacidade }: { paletes: PaleteDetalhe[]; capacidade?: number }) {
  const total = capacidade ?? paletes.length;
  const byPos = new Map<number, PaleteDetalhe>();
  paletes.forEach((p) => byPos.set(p.posicao, p));
  const slots = Array.from({ length: total }, (_, i) => byPos.get(i + 1) ?? null);

  return (
    <div className="mt-6">
      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
        Paletes — <span className="text-slate-900">{paletes.length}</span> / {total}
      </p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {slots.map((p, i) => (
          <div
            key={i}
            className={cn(
              "relative flex min-h-[78px] flex-col justify-between rounded-xl border-2 p-2",
              p ? "border-emerald-300 bg-emerald-50" : "border-dashed border-slate-300 bg-slate-50"
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px] font-black",
                p ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
              )}>
                P{i + 1}
              </span>
              {p?.quantidade != null && (
                <span className="text-[11px] font-extrabold text-slate-700">{p.quantidade}un</span>
              )}
            </div>
            {p ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-900">{p.conteudo}</p>
                <p className="truncate text-[11px] font-bold text-slate-500">
                  {p.op_numero ?? ""}{p.op_numero && p.cliente ? " · " : ""}{p.cliente ?? ""}
                </p>
              </div>
            ) : (
              <p className="text-center text-xs font-bold text-slate-400">vazio</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
