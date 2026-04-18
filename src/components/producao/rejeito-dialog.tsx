"use client";

import { useState } from "react";
import { MOTIVOS_REJEITO } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface RejeitoDialogProps {
  maxQtd: number;
  onConfirm: (quantidade: number, motivo: string, notas?: string) => void;
  onCancel: () => void;
}

export function RejeitoDialog({ maxQtd, onConfirm, onCancel }: RejeitoDialogProps) {
  const [qtd, setQtd] = useState<string>("1");
  const [selected, setSelected] = useState<string | null>(null);
  const [notas, setNotas] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl">❌</div>
          <h2 className="text-xl font-black text-slate-900">Registar Rejeitados</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">Unidades não conformes</p>
        </div>

        {/* Quantidade */}
        <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Quantidade</p>
          <input
            type="number"
            min={1}
            max={maxQtd}
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-center text-4xl font-black text-red-700"
          />
        </div>

        {/* Motivos */}
        <div className="mt-4">
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Motivo</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {MOTIVOS_REJEITO.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-xs font-extrabold transition-all active:scale-95",
                  selected === m.id
                    ? "border-red-500 bg-red-50 text-red-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                <span className="text-base">{m.icon}</span>
                <span className="flex-1">{m.label}</span>
              </button>
            ))}
          </div>
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

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="rounded-2xl bg-slate-200 py-3.5 font-extrabold text-slate-700 transition-all hover:bg-slate-300 active:scale-95"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              const n = Number(qtd);
              if (selected && n > 0) onConfirm(n, selected, notas.trim() || undefined);
            }}
            disabled={!selected || !qtd || Number(qtd) < 1}
            className="rounded-2xl bg-red-600 py-3.5 font-extrabold text-white shadow-md transition-all hover:bg-red-700 active:scale-95 disabled:opacity-50"
          >
            Registar
          </button>
        </div>
      </div>
    </div>
  );
}
