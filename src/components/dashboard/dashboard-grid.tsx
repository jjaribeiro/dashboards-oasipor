"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";
import { notifyMutation } from "@/hooks/use-realtime-table";
import { COLUMN_CONFIG } from "@/lib/constants";
import { getUrgencyLevel } from "@/lib/utils";
import { Column } from "./column";
import { CardConcurso } from "./card-concurso";
import { CardCotacao } from "./card-cotacao";
import { CardEncomenda } from "./card-encomenda";
import { CardTarefa } from "./card-tarefa";
import { CardAmostra } from "./card-amostra";
import { FormConcurso } from "@/components/forms/form-concurso";
import { FormCotacao } from "@/components/forms/form-cotacao";
import { FormEncomenda } from "@/components/forms/form-encomenda";
import { FormTarefa } from "@/components/forms/form-tarefa";
import { FormAmostra } from "@/components/forms/form-amostra";
import { ClockDisplay } from "@/components/clock-display";
import { toast } from "sonner";
import type { Concurso, Cotacao, Encomenda, Tarefa, Amostra } from "@/lib/types";

interface DashboardGridProps {
  initialConcursos: Concurso[];
  initialCotacoes: Cotacao[];
  initialEncomendas: Encomenda[];
  initialTarefas: Tarefa[];
  initialAmostras: Amostra[];
  kiosk?: boolean;
}

export function DashboardGrid({
  initialConcursos,
  initialCotacoes,
  initialEncomendas,
  initialTarefas,
  initialAmostras,
  kiosk = false,
}: DashboardGridProps) {
  const { items: concursos } = useRealtime<Concurso>("concursos", initialConcursos, "prazo");
  const { items: cotacoes } = useRealtime<Cotacao>("cotacoes", initialCotacoes, "prazo");
  const { items: encomendas } = useRealtime<Encomenda>("encomendas", initialEncomendas, "data_encomenda");
  const { items: tarefas } = useRealtime<Tarefa>("tarefas", initialTarefas, "data_hora");
  const { items: amostras } = useRealtime<Amostra>("amostras", initialAmostras, "data_expedicao");

  // Form state
  const [concursoForm, setConcursoForm] = useState(false);
  const [cotacaoForm, setCotacaoForm] = useState(false);
  const [encomendaForm, setEncomendaForm] = useState(false);
  const [tarefaForm, setTarefaForm] = useState(false);
  const [amostraForm, setAmostraForm] = useState(false);

  // Edit state
  const [editConcurso, setEditConcurso] = useState<Concurso | null>(null);
  const [editCotacao, setEditCotacao] = useState<Cotacao | null>(null);
  const [editEncomenda, setEditEncomenda] = useState<Encomenda | null>(null);
  const [editTarefa, setEditTarefa] = useState<Tarefa | null>(null);
  const [editAmostra, setEditAmostra] = useState<Amostra | null>(null);

  // Completing animation state
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  // Auto-reload in kiosk mode every 30 minutes
  useEffect(() => {
    if (!kiosk) return;
    const timer = setTimeout(() => window.location.reload(), 30 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [kiosk]);

  // Pagination: 4 cards per column, rotate pages
  const CARDS_PER_PAGE = 4;
  const ROTATION_SECONDS = 30;
  const totalPages = Math.max(
    1,
    Math.ceil(concursos.length / CARDS_PER_PAGE),
    Math.ceil(cotacoes.length / CARDS_PER_PAGE),
    Math.ceil(encomendas.length / CARDS_PER_PAGE),
    Math.ceil(amostras.length / CARDS_PER_PAGE),
    Math.ceil(tarefas.length / CARDS_PER_PAGE),
  );
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);

  // Clamp page when totalPages shrinks
  useEffect(() => {
    if (page >= totalPages) setPage(0);
  }, [totalPages, page]);

  // Pause rotation when any modal is open
  useEffect(() => {
    const anyOpen = concursoForm || cotacaoForm || encomendaForm || tarefaForm || amostraForm;
    setPaused(anyOpen);
  }, [concursoForm, cotacaoForm, encomendaForm, tarefaForm, amostraForm]);

  // Page change timer (bar is pure CSS animation synced via key={page})
  useEffect(() => {
    if (paused || totalPages <= 1) return;
    const pageTick = setInterval(() => {
      setPage((pg) => (pg + 1) % totalPages);
    }, ROTATION_SECONDS * 1000);
    return () => clearInterval(pageTick);
  }, [paused, totalPages]);

  const start = page * CARDS_PER_PAGE;
  const end = start + CARDS_PER_PAGE;
  const concursosPage = concursos.slice(start, end);
  const cotacoesPage = cotacoes.slice(start, end);
  const encomendasPage = encomendas.slice(start, end);
  const tarefasPage = tarefas.slice(start, end);
  const amostrasPage = amostras.slice(start, end);

  // Count overdue items across all columns
  const overdueCount = useMemo(() => {
    let count = 0;
    concursos.forEach((c) => { if (getUrgencyLevel(c.prazo) === "overdue") count++; });
    cotacoes.forEach((c) => { if (getUrgencyLevel(c.prazo) === "overdue") count++; });
    encomendas.forEach((e) => { if (getUrgencyLevel(e.data_encomenda) === "overdue") count++; });
    tarefas.forEach((t) => { if (getUrgencyLevel(t.data_hora) === "overdue") count++; });
    amostras.forEach((a) => { if (getUrgencyLevel(a.data_expedicao) === "overdue") count++; });
    return count;
  }, [concursos, cotacoes, encomendas, tarefas, amostras]);

  const markComplete = useCallback(
    async (table: string, id: string) => {
      setCompletingIds((prev) => new Set(prev).add(id));

      setTimeout(async () => {
        const { error } = await supabase
          .from(table)
          .update({ is_completed: true, completed_at: new Date().toISOString() })
          .eq("id", id);

        if (error) {
          toast.error("Erro ao concluir item");
          setCompletingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } else {
          notifyMutation(table);
          toast.success("Item concluído");
        }
      }, 500);
    },
    []
  );

  return (
    <div className={`relative flex h-full flex-col${kiosk ? " kiosk" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-oasipor.png" alt="Oasipor" className={kiosk ? "h-20" : "h-14"} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <a href="/" className="flex items-center gap-2 text-slate-500 transition-colors hover:text-slate-900" title="Voltar ao hub">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </a>
          <h1 className={kiosk ? "text-3xl font-bold text-slate-900" : "text-xl font-bold text-slate-900"}>
            Dashboard Comercial
          </h1>
          {overdueCount > 0 && (
            <div className="banner-flash ml-4 flex items-center gap-2 rounded-lg border-2 border-red-300 bg-red-100 px-4 py-1.5 text-sm font-bold text-red-700 shadow-sm">
              <span className="text-base">⚠️</span>
              <span className={kiosk ? "text-lg" : "text-sm"}>
                {overdueCount} {overdueCount === 1 ? "item atrasado" : "items atrasados"}
              </span>
            </div>
          )}
        </div>
        <ClockDisplay />
      </div>

      {/* Rotation progress bar (only if multiple pages) */}
      {totalPages > 1 && (
        <div className="h-1 w-full bg-slate-200">
          <div
            key={`${page}-${paused}`}
            className="h-full bg-blue-500"
            style={{
              animation: `progressFill ${ROTATION_SECONDS}s linear forwards`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </div>
      )}

      {/* Grid - 5 colunas */}
      <div className="grid flex-1 grid-cols-5 gap-3 overflow-hidden p-3">
        {/* Concursos */}
        <Column
          title={COLUMN_CONFIG.concursos.title}
          icon={COLUMN_CONFIG.concursos.icon}
          count={concursos.length}
          accentClass="bg-blue-100 text-blue-700"
          kiosk={kiosk}
          onAdd={() => {
            setEditConcurso(null);
            setConcursoForm(true);
          }}
        >
          {concursosPage.map((item) => (
            <CardConcurso
              key={item.id}
              item={item}
              completing={completingIds.has(item.id)}
              onComplete={(id) => markComplete("concursos", id)}
              onEdit={(item) => {
                setEditConcurso(item);
                setConcursoForm(true);
              }}
            />
          ))}
        </Column>

        {/* Cotacoes */}
        <Column
          title={COLUMN_CONFIG.cotacoes.title}
          icon={COLUMN_CONFIG.cotacoes.icon}
          count={cotacoes.length}
          accentClass="bg-purple-100 text-purple-700"
          kiosk={kiosk}
          onAdd={() => {
            setEditCotacao(null);
            setCotacaoForm(true);
          }}
        >
          {cotacoesPage.map((item) => (
            <CardCotacao
              key={item.id}
              item={item}
              completing={completingIds.has(item.id)}
              onComplete={(id) => markComplete("cotacoes", id)}
              onEdit={(item) => {
                setEditCotacao(item);
                setCotacaoForm(true);
              }}
            />
          ))}
        </Column>

        {/* Encomendas */}
        <Column
          title={COLUMN_CONFIG.encomendas.title}
          icon={COLUMN_CONFIG.encomendas.icon}
          count={encomendas.length}
          accentClass="bg-amber-100 text-amber-700"
          kiosk={kiosk}
          onAdd={() => {
            setEditEncomenda(null);
            setEncomendaForm(true);
          }}
        >
          {encomendasPage.map((item) => (
            <CardEncomenda
              key={item.id}
              item={item}
              completing={completingIds.has(item.id)}
              onComplete={(id) => markComplete("encomendas", id)}
              onEdit={(item) => {
                setEditEncomenda(item);
                setEncomendaForm(true);
              }}
            />
          ))}
        </Column>

        {/* Amostras */}
        <Column
          title={COLUMN_CONFIG.amostras.title}
          icon={COLUMN_CONFIG.amostras.icon}
          count={amostras.length}
          accentClass="bg-rose-100 text-rose-700"
          kiosk={kiosk}
          onAdd={() => {
            setEditAmostra(null);
            setAmostraForm(true);
          }}
        >
          {amostrasPage.map((item) => (
            <CardAmostra
              key={item.id}
              item={item}
              completing={completingIds.has(item.id)}
              onComplete={(id) => markComplete("amostras", id)}
              onEdit={(item) => {
                setEditAmostra(item);
                setAmostraForm(true);
              }}
            />
          ))}
        </Column>

        {/* Tarefas */}
        <Column
          title={COLUMN_CONFIG.tarefas.title}
          icon={COLUMN_CONFIG.tarefas.icon}
          count={tarefas.length}
          accentClass="bg-emerald-100 text-emerald-700"
          kiosk={kiosk}
          onAdd={() => {
            setEditTarefa(null);
            setTarefaForm(true);
          }}
        >
          {tarefasPage.map((item) => (
            <CardTarefa
              key={item.id}
              item={item}
              completing={completingIds.has(item.id)}
              onComplete={(id) => markComplete("tarefas", id)}
              onEdit={(item) => {
                setEditTarefa(item);
                setTarefaForm(true);
              }}
            />
          ))}
        </Column>
      </div>

      {/* Page indicator (only if multiple pages) */}
      {totalPages > 1 && (
        <button
          onClick={() => setPage((p) => (p + 1) % totalPages)}
          className="absolute bottom-3 right-4 rounded-full bg-slate-800/80 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-slate-700"
          title="Próxima página"
        >
          {page + 1} / {totalPages} {paused && "⏸"}
        </button>
      )}

      {/* Modals */}
      <FormConcurso open={concursoForm} onOpenChange={setConcursoForm} editItem={editConcurso} />
      <FormCotacao open={cotacaoForm} onOpenChange={setCotacaoForm} editItem={editCotacao} />
      <FormEncomenda open={encomendaForm} onOpenChange={setEncomendaForm} editItem={editEncomenda} />
      <FormAmostra open={amostraForm} onOpenChange={setAmostraForm} editItem={editAmostra} />
      <FormTarefa open={tarefaForm} onOpenChange={setTarefaForm} editItem={editTarefa} />
    </div>
  );
}
