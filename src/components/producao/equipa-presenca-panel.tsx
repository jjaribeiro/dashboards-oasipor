"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { EstadoPresenca, Funcionario, FuncionarioPresenca, TipoPresenca } from "@/lib/types";

interface Props {
  zonaId: string;
  equipa: Funcionario[];
}

function estadoDe(eventos: FuncionarioPresenca[]): EstadoPresenca {
  if (eventos.length === 0) return "ausente";
  const ultimo = eventos[0];
  if (ultimo.tipo === "entrada" || ultimo.tipo === "pausa_fim") return "presente";
  if (ultimo.tipo === "pausa_inicio") return "em_pausa";
  return "ausente"; // saida
}

export function EquipaPresencaPanel({ zonaId, equipa }: Props) {
  const [presencas, setPresencas] = useState<FuncionarioPresenca[]>([]);
  const [pinOpen, setPinOpen] = useState<{ funcionario: Funcionario; estadoAtual: EstadoPresenca } | null>(null);

  // Carregar presenças hoje + subscrever realtime
  useEffect(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    supabase
      .from("funcionario_presencas")
      .select("*")
      .gte("criado_em", hoje.toISOString())
      .order("criado_em", { ascending: false })
      .then(({ data }) => { if (data) setPresencas(data as FuncionarioPresenca[]); });

    const channel = supabase
      .channel("presencas_rt_" + zonaId)
      .on("postgres_changes", { event: "*", schema: "public", table: "funcionario_presencas" }, (payload) => {
        setPresencas((prev) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as FuncionarioPresenca;
            return [row, ...prev];
          }
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string })?.id;
            return id ? prev.filter((p) => p.id !== id) : prev;
          }
          return prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [zonaId]);

  // Agrupar por funcionário
  const porFuncionario = useMemo(() => {
    const m = new Map<string, FuncionarioPresenca[]>();
    for (const p of presencas) {
      const arr = m.get(p.funcionario_id) ?? [];
      arr.push(p);
      m.set(p.funcionario_id, arr);
    }
    return m;
  }, [presencas]);

  const estadoPorId = useMemo(() => {
    const m = new Map<string, EstadoPresenca>();
    for (const f of equipa) m.set(f.id, estadoDe(porFuncionario.get(f.id) ?? []));
    return m;
  }, [equipa, porFuncionario]);

  const counts = useMemo(() => {
    let presente = 0, pausa = 0, ausente = 0;
    for (const f of equipa) {
      const s = estadoPorId.get(f.id) ?? "ausente";
      if (s === "presente") presente++;
      else if (s === "em_pausa") pausa++;
      else ausente++;
    }
    return { presente, pausa, ausente };
  }, [equipa, estadoPorId]);

  if (equipa.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Equipa</span>
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700">{counts.presente} presente{counts.presente === 1 ? "" : "s"}</span>
          {counts.pausa > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-700">{counts.pausa} pausa</span>}
          {counts.ausente > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-600">{counts.ausente} ausente{counts.ausente === 1 ? "" : "s"}</span>}
        </div>
        <div className="ml-2 flex flex-wrap gap-1">
          {equipa.map((f) => {
            const estado = estadoPorId.get(f.id) ?? "ausente";
            const coresBadge: Record<EstadoPresenca, string> = {
              presente: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
              em_pausa: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
              ausente: "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
            };
            const dot: Record<EstadoPresenca, string> = {
              presente: "bg-emerald-500",
              em_pausa: "bg-amber-500",
              ausente: "bg-slate-300",
            };
            return (
              <button
                key={f.id}
                onClick={() => setPinOpen({ funcionario: f, estadoAtual: estado })}
                className={cn("group inline-flex items-center gap-1.5 rounded-full border-2 py-0.5 pl-0.5 pr-2 text-xs font-bold transition-colors", coresBadge[estado])}
                title={`${f.nome} — ${estado}`}
              >
                <span
                  className="relative inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-extrabold text-white"
                  style={{ backgroundColor: f.cor ?? "#64748b" }}
                >
                  {f.iniciais ?? f.nome[0]}
                  <span className={cn("absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-1 ring-white", dot[estado])} />
                </span>
                {f.nome.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </div>

      {pinOpen && (
        <PresencaPinDialog
          funcionario={pinOpen.funcionario}
          estadoAtual={pinOpen.estadoAtual}
          zonaId={zonaId}
          onClose={() => setPinOpen(null)}
        />
      )}
    </>
  );
}

/* ===== PIN dialog ===== */
function PresencaPinDialog({
  funcionario, estadoAtual, zonaId, onClose,
}: { funcionario: Funcionario; estadoAtual: EstadoPresenca; zonaId: string; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [action, setAction] = useState<TipoPresenca | null>(null);
  const [saving, setSaving] = useState(false);

  // Ações disponíveis consoante estado
  const acoes: { tipo: TipoPresenca; label: string; tone: "emerald" | "amber" | "slate" | "red"; icon: string }[] = useMemo(() => {
    if (estadoAtual === "ausente") {
      return [{ tipo: "entrada", label: "Dar entrada", tone: "emerald", icon: "▶" }];
    }
    if (estadoAtual === "em_pausa") {
      return [
        { tipo: "pausa_fim", label: "Retomar trabalho", tone: "emerald", icon: "▶" },
        { tipo: "saida", label: "Fim de turno", tone: "red", icon: "⏹" },
      ];
    }
    // presente
    return [
      { tipo: "pausa_inicio", label: "Iniciar pausa", tone: "amber", icon: "⏸" },
      { tipo: "saida", label: "Fim de turno", tone: "red", icon: "⏹" },
    ];
  }, [estadoAtual]);

  const submit = useCallback(async (tipo: TipoPresenca) => {
    if (!funcionario.pin) {
      toast.error("Esta pessoa não tem PIN configurado");
      return;
    }
    if (pin.trim() !== funcionario.pin) {
      toast.error("PIN incorreto");
      return;
    }
    setAction(tipo);
    setSaving(true);
    const { error } = await supabase.from("funcionario_presencas").insert({
      funcionario_id: funcionario.id,
      funcionario_nome: funcionario.nome,
      zona_id: zonaId,
      tipo,
    });
    setSaving(false);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    const labels: Record<TipoPresenca, string> = {
      entrada: "Entrada registada",
      pausa_inicio: "Pausa iniciada",
      pausa_fim: "Trabalho retomado",
      saida: "Saída registada",
    };
    toast.success(labels[tipo]);
    onClose();
  }, [pin, funcionario, zonaId, onClose]);

  const estadoLabels: Record<EstadoPresenca, string> = {
    ausente: "Ausente",
    presente: "Presente",
    em_pausa: "Em pausa",
  };
  const estadoCores: Record<EstadoPresenca, string> = {
    ausente: "bg-slate-100 text-slate-600",
    presente: "bg-emerald-100 text-emerald-700",
    em_pausa: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        {/* Avatar + nome */}
        <div className="mb-3 flex items-center gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-black text-white shadow ring-2 ring-white"
            style={{ backgroundColor: funcionario.cor ?? "#64748b" }}
          >{funcionario.iniciais ?? funcionario.nome[0]}</div>
          <div className="flex-1 min-w-0">
            <h3 className="truncate text-base font-black text-slate-900">{funcionario.nome}</h3>
            <span className={cn("mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase", estadoCores[estadoAtual])}>
              {estadoLabels[estadoAtual]}
            </span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        {/* PIN input */}
        <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">PIN</label>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="mt-1 w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-center text-2xl font-black tracking-[0.5em] focus:border-emerald-400 focus:outline-none"
          placeholder="••••"
          onKeyDown={(e) => {
            if (e.key === "Enter" && acoes.length === 1) submit(acoes[0].tipo);
          }}
        />
        {!funcionario.pin && (
          <p className="mt-1 text-[11px] font-bold text-red-600">⚠ Sem PIN configurado — define um em Dados &amp; Configuração</p>
        )}

        {/* Ações */}
        <div className="mt-4 grid gap-2">
          {acoes.map((a) => {
            const cores = {
              emerald: "bg-emerald-600 hover:bg-emerald-700",
              amber: "bg-amber-500 hover:bg-amber-600",
              red: "bg-red-600 hover:bg-red-700",
              slate: "bg-slate-700 hover:bg-slate-800",
            }[a.tone];
            return (
              <button
                key={a.tipo}
                onClick={() => submit(a.tipo)}
                disabled={saving || !pin || !funcionario.pin}
                className={cn("flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-extrabold text-white shadow-sm transition-colors disabled:opacity-40", cores)}
              >
                <span className="text-lg">{a.icon}</span>
                {saving && action === a.tipo ? "A registar…" : a.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
