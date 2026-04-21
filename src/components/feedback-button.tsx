"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [nome, setNome] = useState("");
  const [sending, setSending] = useState(false);
  const [pagina, setPagina] = useState("");

  useEffect(() => {
    setPagina(window.location.pathname);
  }, [open]);

  async function enviar() {
    if (!texto.trim()) return;
    setSending(true);
    const { error } = await supabase.from("sugestoes").insert({
      texto: texto.trim(),
      pagina,
      nome_pessoa: nome.trim() || null,
    });
    setSending(false);
    if (error) { toast.error("Erro ao enviar sugestão"); return; }
    toast.success("Sugestão enviada, obrigado!");
    setTexto("");
    setNome("");
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 right-4 z-40 flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/80 px-3 py-1.5 text-[11px] font-extrabold text-slate-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md"
        title="Enviar sugestão de melhoria"
      >
        💡 Sugestão
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-start p-6" onClick={() => setOpen(false)}>
          <div
            className="w-96 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">💡 Sugestão de Melhoria</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <p className="mb-3 text-[11px] text-slate-500">Página: <span className="font-bold text-slate-700">{pagina}</span></p>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Descreve a tua sugestão..."
              rows={4}
              className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-blue-400 focus:outline-none resize-none"
              autoFocus
            />
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="O teu nome (opcional)"
              className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-blue-400 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >Cancelar</button>
              <button
                onClick={enviar}
                disabled={!texto.trim() || sending}
                className="flex-1 rounded-lg bg-slate-800 py-2 text-xs font-extrabold text-white hover:bg-slate-700 disabled:opacity-40"
              >{sending ? "A enviar…" : "Enviar"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
