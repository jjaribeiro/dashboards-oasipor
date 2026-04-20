"use client";

import { useMemo, useState } from "react";
import { MOTIVOS_PAUSA } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Funcionario } from "@/lib/types";

interface PausaDialogProps {
  equipa?: Funcionario[];
  onConfirm: (motivo: string, notas: string | undefined, pessoas: Array<{ id: string; nome: string }>) => void;
  onCancel: () => void;
}

export function PausaDialog({ equipa = [], onConfirm, onCancel }: PausaDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [modoPessoas, setModoPessoas] = useState<"todos" | "alguns">("todos");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set());

  const pessoasFinais = useMemo(() => {
    if (modoPessoas === "todos") return equipa.map((f) => ({ id: f.id, nome: f.nome }));
    return equipa.filter((f) => selecionadas.has(f.id)).map((f) => ({ id: f.id, nome: f.nome }));
  }, [modoPessoas, selecionadas, equipa]);

  function togglePessoa(id: string) {
    setSelecionadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const podePausar = !!selected && (equipa.length === 0 || pessoasFinais.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 text-2xl">⏸</div>
          <h2 className="text-xl font-black text-slate-900">Pausar OP</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">Porque estás a pausar?</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {MOTIVOS_PAUSA.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-left text-sm font-extrabold transition-all active:scale-95",
                selected === m.id
                  ? "border-yellow-500 bg-yellow-50 text-yellow-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              <span className="text-lg">{m.icon}</span>
              <span className="flex-1">{m.label}</span>
            </button>
          ))}
        </div>

        {selected === "outro" && (
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Descrever motivo..."
            rows={2}
            className="mt-3 w-full rounded-xl border-2 border-slate-200 p-3 text-sm font-bold text-slate-900"
          />
        )}

        {/* Seletor de pessoas */}
        {equipa.length > 0 && (
          <div className="mt-4 rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-600">Quem vai pausar?</p>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => setModoPessoas("todos")}
                className={cn(
                  "rounded-lg border-2 px-3 py-2 text-sm font-extrabold transition-all active:scale-95",
                  modoPessoas === "todos"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                👥 Toda a equipa ({equipa.length})
              </button>
              <button
                onClick={() => setModoPessoas("alguns")}
                className={cn(
                  "rounded-lg border-2 px-3 py-2 text-sm font-extrabold transition-all active:scale-95",
                  modoPessoas === "alguns"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                👤 Apenas alguns
              </button>
            </div>
            {modoPessoas === "alguns" && (
              <div className="flex flex-wrap gap-1.5">
                {equipa.map((f) => {
                  const on = selecionadas.has(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => togglePessoa(f.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border-2 py-1 pl-1 pr-2.5 text-xs font-extrabold transition-all active:scale-95",
                        on
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white"
                        style={{ backgroundColor: f.cor ?? "#64748b" }}
                      >
                        {f.iniciais}
                      </span>
                      {f.nome}
                      {on && <span className="text-emerald-600">✓</span>}
                    </button>
                  );
                })}
                {equipa.length === 0 && <span className="text-xs font-bold italic text-slate-400">— sem equipa atribuída —</span>}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="rounded-2xl bg-slate-200 py-3.5 font-extrabold text-slate-700 transition-all hover:bg-slate-300 active:scale-95"
          >
            Cancelar
          </button>
          <button
            onClick={() => selected && podePausar && onConfirm(selected, notas.trim() || undefined, pessoasFinais)}
            disabled={!podePausar}
            className="rounded-2xl bg-yellow-500 py-3.5 font-extrabold text-white shadow-md transition-all hover:bg-yellow-600 active:scale-95 disabled:opacity-50"
          >
            ⏸ Pausar {pessoasFinais.length > 0 && <span className="text-xs font-bold opacity-90">({pessoasFinais.length})</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
