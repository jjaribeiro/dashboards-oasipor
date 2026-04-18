"use client";

import { useState } from "react";
import { MOTIVOS_PAUSA } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface PausaDialogProps {
  onConfirm: (motivo: string, notas?: string) => void;
  onCancel: () => void;
}

export function PausaDialog({ onConfirm, onCancel }: PausaDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [notas, setNotas] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
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

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="rounded-2xl bg-slate-200 py-3.5 font-extrabold text-slate-700 transition-all hover:bg-slate-300 active:scale-95"
          >
            Cancelar
          </button>
          <button
            onClick={() => selected && onConfirm(selected, notas.trim() || undefined)}
            disabled={!selected}
            className="rounded-2xl bg-yellow-500 py-3.5 font-extrabold text-white shadow-md transition-all hover:bg-yellow-600 active:scale-95 disabled:opacity-50"
          >
            ⏸ Pausar
          </button>
        </div>
      </div>
    </div>
  );
}
