"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { DURACAO_DEFAULT_MIN, ZONA_LABEL } from "@/lib/constants";
import { toast } from "sonner";
import { notifyMutation } from "@/hooks/use-realtime-table";
import { cn } from "@/lib/utils";
import type { EquipamentoCiclo, OrdemProducao } from "@/lib/types";

interface FormCicloProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: EquipamentoCiclo | null;
  zonaId: string;
}

// Parse conteúdo string back into product rows for display
function parseConteudo(conteudo: string | null): Array<{ ref: string; nome: string; qtd: string }> {
  if (!conteudo) return [];
  // Format: "REF Nome ×QTD (OP X) | REF2 Nome2 ×QTD2 (OP Y)"
  // Ref can have suffixes like "215125 G", "213112 NE"
  return conteudo.split(" | ").map((part) => {
    const match = part.match(/^(.+?)\s+×(\d+)\s+\(OP/);
    if (match) {
      const full = match[1].trim();
      // Split: ref is the code (digits + optional suffix), rest is product name
      // Find where the product name starts (after ref pattern like "215125 G" or "10825005")
      const refMatch = full.match(/^(\d+(?:\s+[A-Z]{1,3})?)\s+(.+)$/);
      if (refMatch) return { ref: refMatch[1], nome: refMatch[2], qtd: match[2] };
      return { ref: full, nome: "", qtd: match[2] };
    }
    return { ref: "", nome: part.trim(), qtd: "" };
  });
}

export function FormCiclo({ open, onOpenChange, editItem, zonaId }: FormCicloProps) {
  const [loading, setLoading] = useState(false);
  const [preCond, setPreCond] = useState<string>(zonaId.startsWith("pre_cond") ? zonaId : "pre_cond_1");
  const [arejamento, setArejamento] = useState<string>(editItem?.arejamento_destino ?? "arejamento_1");
  const [conteudo, setConteudo] = useState(editItem?.conteudo ?? "");
  const [notas, setNotas] = useState(editItem?.notas ?? "");
  const [numPaletes, setNumPaletes] = useState<number>(editItem?.paletes ?? 8);

  // OPs concluídas disponíveis para carregar
  const [opsConcluidas, setOpsConcluidas] = useState<OrdemProducao[]>([]);
  const [selectedOPs, setSelectedOPs] = useState<Set<string>>(new Set());
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!editItem) {
      supabase
        .from("ordens_producao")
        .select("*")
        .eq("estado", "concluida")
        .eq("zona_id", "embalamento")
        .order("updated_at", { ascending: false })
        .then(({ data }) => {
          if (data) setOpsConcluidas(data as OrdemProducao[]);
        });
    }
  }, [editItem]);

  function toggleOP(id: string) {
    setSelectedOPs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setQuantidades((q) => { const nq = { ...q }; delete nq[id]; return nq; });
      } else {
        next.add(id);
        const op = opsConcluidas.find((o) => o.id === id);
        if (op) setQuantidades((q) => ({ ...q, [id]: op.quantidade_atual || op.quantidade_alvo }));
      }
      return next;
    });
  }

  function setQtd(id: string, val: number) {
    setQuantidades((q) => ({ ...q, [id]: val }));
  }

  // Timeline steps for edit view
  const timelineSteps = useMemo(() => {
    if (!editItem) return [];
    const zona = editItem.zona_id;
    const dest = editItem.arejamento_destino ?? "arejamento_1";
    const steps = [
      { id: "pre_cond", label: zona === "pre_cond_1" ? "Pré-Cond 1" : zona === "pre_cond_2" ? "Pré-Cond 2" : "Pré-Cond", duration: "24h" },
      { id: "esterilizador", label: "Esterilizador", duration: "10h" },
      { id: "arejamento", label: dest === "arejamento_2" ? "Arejamento 2" : "Arejamento 1", duration: "24h" },
      { id: "concluido", label: "Concluído", duration: "" },
    ];
    // Determine active step
    let activeIdx = 0;
    if (zona === "esterilizador") activeIdx = 1;
    else if (zona === "arejamento_1" || zona === "arejamento_2") activeIdx = 2;
    else if (editItem.estado === "concluido") activeIdx = 3;
    return steps.map((s, i) => ({ ...s, active: i === activeIdx, done: i < activeIdx }));
  }, [editItem]);

  // Parsed products for edit view
  const produtos = useMemo(() => editItem ? parseConteudo(editItem.conteudo) : [], [editItem]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    if (editItem) {
      const form = new FormData(e.currentTarget);
      const estado = form.get("estado") as string;
      const data: Record<string, unknown> = {
        estado,
        arejamento_destino: arejamento,
        notas: notas.trim() || null,
      };

      if (estado === "vazio") {
        data.inicio = null;
        data.fim_previsto = null;
        data.fim_real = null;
        data.conteudo = null;
        data.paletes = null;
        data.paletes_detalhe = [];
      }

      const { error } = await supabase.from("equipamento_ciclo").update(data).eq("id", editItem.id);
      setLoading(false);
      if (error) { toast.error("Erro ao guardar"); return; }
      notifyMutation("equipamento_ciclo");
      toast.success("Ciclo atualizado");
      onOpenChange(false);
    } else {
      // Novo ciclo
      const duracao = DURACAO_DEFAULT_MIN[preCond] ?? 1440;
      const agora = new Date();

      const opsSelected = opsConcluidas.filter((op) => selectedOPs.has(op.id));
      const opsText = opsSelected
        .map((op) => {
          const qtd = quantidades[op.id] ?? op.quantidade_atual ?? op.quantidade_alvo;
          return `${op.produto_codigo ?? ""} ${op.produto_nome} ×${qtd} (OP ${op.numero ?? "?"})`.trim();
        })
        .join(" | ");

      const finalConteudo = conteudo.trim() || opsText || null;

      const paletesDetalhe = Array.from({ length: numPaletes }, (_, i) => ({
        posicao: i + 1,
        conteudo: `P${i + 1}`,
        artigos: [],
      }));

      const data = {
        zona_id: preCond,
        estado: "em_ciclo",
        conteudo: finalConteudo,
        paletes: numPaletes,
        paletes_detalhe: paletesDetalhe,
        inicio: agora.toISOString(),
        fim_previsto: new Date(agora.getTime() + duracao * 60_000).toISOString(),
        arejamento_destino: arejamento,
        notas: notas.trim() || null,
      };

      const { error } = await supabase.from("equipamento_ciclo").insert(data);
      if (error) { setLoading(false); toast.error("Erro ao criar ciclo"); return; }

      for (const op of opsSelected) {
        const total = op.quantidade_atual || op.quantidade_alvo;
        const qtdCiclo = quantidades[op.id] ?? total;
        const restante = total - qtdCiclo;
        if (restante > 0) {
          await supabase.from("ordens_producao").update({ quantidade_atual: restante }).eq("id", op.id);
        }
      }

      setLoading(false);
      notifyMutation("equipamento_ciclo");
      toast.success(`Ciclo iniciado em ${ZONA_LABEL[preCond]}`);
      onOpenChange(false);
    }
  }

  async function apagar() {
    if (!editItem) return;
    if (!confirm("Tem a certeza que quer apagar este ciclo?")) return;
    const { error } = await supabase.from("equipamento_ciclo").delete().eq("id", editItem.id);
    if (error) toast.error("Erro ao apagar ciclo");
    else { notifyMutation("equipamento_ciclo"); toast.success("Ciclo apagado"); onOpenChange(false); }
  }

  const isNew = !editItem;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-200 bg-white text-slate-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editItem ? `${ZONA_LABEL[editItem.zona_id]} — Ciclo` : "Carregar Ciclo de Esterilização"}</DialogTitle>
        </DialogHeader>

        {/* ========== EDIT VIEW ========== */}
        {editItem && (
          <div className="flex flex-col gap-4">
            {/* Timeline visual */}
            <div className="flex items-center justify-center gap-0 rounded-lg bg-slate-50 px-3 py-3">
              {timelineSteps.map((step, i) => (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold",
                      step.done ? "bg-emerald-500 text-white" :
                      step.active ? "bg-indigo-500 text-white ring-2 ring-indigo-300" :
                      "bg-slate-200 text-slate-400"
                    )}>
                      {step.done ? "✓" : i + 1}
                    </div>
                    <span className={cn(
                      "mt-1 text-center text-[10px] font-bold leading-tight",
                      step.active ? "text-indigo-700" : step.done ? "text-emerald-700" : "text-slate-400"
                    )}>
                      {step.label}
                    </span>
                    {step.duration && (
                      <span className="text-[9px] text-slate-400">{step.duration}</span>
                    )}
                  </div>
                  {i < timelineSteps.length - 1 && (
                    <div className={cn(
                      "mx-1 h-0.5 w-6",
                      step.done ? "bg-emerald-400" : "bg-slate-200"
                    )} />
                  )}
                </div>
              ))}
            </div>

            {/* Tabela de produtos */}
            {produtos.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="grid grid-cols-[80px_1fr_70px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                  <span>Ref</span>
                  <span>Descrição</span>
                  <span className="text-right">Qtd</span>
                </div>
                {produtos.map((p, i) => (
                  <div key={i} className="grid grid-cols-[80px_1fr_70px] gap-2 border-b border-slate-50 px-3 py-2 text-sm">
                    <span className="font-mono text-xs font-bold text-slate-900">{p.ref}</span>
                    <span className="truncate text-xs font-bold text-slate-600">{p.nome}</span>
                    <span className="text-right text-xs font-bold text-slate-900">{p.qtd}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Estado e destino */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="estado">Estado</Label>
                  <Select name="estado" defaultValue={editItem.estado}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vazio">Vazio</SelectItem>
                      <SelectItem value="em_ciclo">Em Ciclo</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                      <SelectItem value="alarme">Alarme</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Destino Arejamento</Label>
                  <select
                    value={arejamento}
                    onChange={(e) => setArejamento(e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
                  >
                    <option value="arejamento_1">Arejamento 1</option>
                    <option value="arejamento_2">Arejamento 2</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="notas">Notas</Label>
                <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="mt-1" />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? "A guardar..." : "Guardar"}
                </Button>
                <Button type="button" variant="secondary" onClick={apagar} className="bg-red-100 text-red-700 hover:bg-red-200">
                  Apagar
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ========== NEW CYCLE VIEW ========== */}
        {isNew && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* OPs concluídas em tabela */}
            {opsConcluidas.length > 0 && (
              <div>
                <Label>OPs no Embalamento — Concluídas</Label>
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                  <div className="grid grid-cols-[auto_80px_1fr_80px_80px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                    <span></span>
                    <span>Ref</span>
                    <span>Descrição</span>
                    <span className="text-center">Qtd Ciclo</span>
                    <span className="text-center">Restante</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {opsConcluidas.map((op) => {
                      const selected = selectedOPs.has(op.id);
                      const total = op.quantidade_atual || op.quantidade_alvo;
                      const qtdCiclo = quantidades[op.id] ?? total;
                      const restante = total - qtdCiclo;
                      return (
                        <div
                          key={op.id}
                          className={cn(
                            "grid grid-cols-[auto_80px_1fr_80px_80px] items-center gap-2 border-b border-slate-50 px-3 py-2 text-sm transition-colors",
                            selected && "bg-emerald-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleOP(op.id)}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300"
                          />
                          <span className="font-mono text-xs font-bold text-slate-900">{op.produto_codigo}</span>
                          <div className="min-w-0">
                            <span className="block truncate text-xs font-bold text-slate-600">{op.produto_nome}</span>
                            <span className="text-[10px] text-slate-400">{total} un total</span>
                          </div>
                          <div className="text-center">
                            {selected ? (
                              <input
                                type="number"
                                min={1}
                                max={total}
                                value={qtdCiclo}
                                onChange={(e) => setQtd(op.id, Math.min(total, Math.max(1, Number(e.target.value) || 0)))}
                                className="h-7 w-full rounded border border-slate-200 px-1 text-center text-xs font-bold text-slate-900"
                              />
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </div>
                          <div className="text-center">
                            {selected ? (
                              restante > 0 ? (
                                <span className="text-xs font-bold text-amber-600">{restante}</span>
                              ) : (
                                <span className="text-xs text-slate-400">0</span>
                              )
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {selectedOPs.size > 0 && (
                  <p className="mt-1 text-xs font-bold text-emerald-600">{selectedOPs.size} OP(s) selecionada(s)</p>
                )}
              </div>
            )}

            {opsConcluidas.length === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
                Nenhuma OP concluída no embalamento.
              </div>
            )}

            {/* Paletes + Percurso */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Paletes</Label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={numPaletes}
                  onChange={(e) => setNumPaletes(Math.max(1, Number(e.target.value) || 1))}
                  className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
                />
              </div>
              <div>
                <Label>Pré-Cond</Label>
                <select
                  value={preCond}
                  onChange={(e) => setPreCond(e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
                >
                  <option value="pre_cond_1">Pré-Cond 1</option>
                  <option value="pre_cond_2">Pré-Cond 2</option>
                </select>
              </div>
              <div>
                <Label>Arejamento</Label>
                <select
                  value={arejamento}
                  onChange={(e) => setArejamento(e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900"
                >
                  <option value="arejamento_1">Arejamento 1</option>
                  <option value="arejamento_2">Arejamento 2</option>
                </select>
              </div>
            </div>

            {/* Timeline visual */}
            <div className="flex items-center justify-center gap-0 rounded-lg bg-slate-50 px-3 py-3">
              {[
                { label: preCond === "pre_cond_1" ? "Pré-Cond 1" : "Pré-Cond 2", color: "bg-indigo-500", dur: "24h" },
                { label: "Esterilizador", color: "bg-rose-500", dur: "10h" },
                { label: arejamento === "arejamento_1" ? "Arejamento 1" : "Arejamento 2", color: "bg-amber-500", dur: "24h" },
                { label: "Concluído", color: "bg-emerald-500", dur: "" },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-extrabold text-white", step.color)}>
                      {i + 1}
                    </div>
                    <span className="mt-0.5 text-center text-[10px] font-bold leading-tight text-slate-600">{step.label}</span>
                    {step.dur && <span className="text-[9px] text-slate-400">{step.dur}</span>}
                  </div>
                  {i < arr.length - 1 && <div className="mx-1 h-0.5 w-5 bg-slate-300" />}
                </div>
              ))}
            </div>

            <div>
              <Label htmlFor="notas">Notas</Label>
              <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="mt-1" />
            </div>

            <Button type="submit" disabled={loading || selectedOPs.size === 0} className="w-full">
              {loading ? "A iniciar..." : "Iniciar Ciclo"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
