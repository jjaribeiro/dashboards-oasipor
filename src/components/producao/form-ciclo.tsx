"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { DURACAO_DEFAULT_MIN, ZONA_LABEL } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ArtigoPalete, EquipamentoCiclo, PaleteDetalhe } from "@/lib/types";

interface FormCicloProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: EquipamentoCiclo | null;
  zonaId: string;
  isEsterilizador?: boolean;
}

type ArtigoEditavel = {
  referencia: string;
  op_numero: string;
  quantidade: string;
  cliente: string;
};

type PaleteEditavel = {
  posicao: number;
  artigos: ArtigoEditavel[];
};

const EMPTY_ARTIGO: ArtigoEditavel = { referencia: "", op_numero: "", quantidade: "", cliente: "" };

function initPaletes(item: EquipamentoCiclo | null | undefined, capacidade: number): PaleteEditavel[] {
  const existentes = new Map<number, PaleteDetalhe>();
  (item?.paletes_detalhe ?? []).forEach((p) => existentes.set(p.posicao, p));
  return Array.from({ length: capacidade }, (_, i) => {
    const p = existentes.get(i + 1);
    // Migrar formato antigo (conteudo único) para multi-artigo
    const artigos: ArtigoEditavel[] = [];
    if (p?.artigos && p.artigos.length > 0) {
      p.artigos.forEach((a) => artigos.push({
        referencia: a.referencia ?? "",
        op_numero: a.op_numero ?? "",
        quantidade: a.quantidade != null ? String(a.quantidade) : "",
        cliente: a.cliente ?? "",
      }));
    } else if (p?.conteudo) {
      artigos.push({
        referencia: p.conteudo,
        op_numero: p.op_numero ?? "",
        quantidade: p.quantidade != null ? String(p.quantidade) : "",
        cliente: p.cliente ?? "",
      });
    }
    if (artigos.length === 0) artigos.push({ ...EMPTY_ARTIGO });
    return { posicao: i + 1, artigos };
  });
}

export function FormCiclo({ open, onOpenChange, editItem, zonaId, isEsterilizador }: FormCicloProps) {
  const [loading, setLoading] = useState(false);
  const defaultDur = DURACAO_DEFAULT_MIN[zonaId] ?? 60;
  const capacidade = isEsterilizador ? 8 : Math.max(editItem?.paletes_detalhe?.length ?? 8, 8);
  const [paletes, setPaletes] = useState<PaleteEditavel[]>(() => initPaletes(editItem, capacidade));

  function updateArtigo(paleteIdx: number, artigoIdx: number, patch: Partial<ArtigoEditavel>) {
    setPaletes((prev) => prev.map((p, pi) => {
      if (pi !== paleteIdx) return p;
      const artigos = p.artigos.map((a, ai) => (ai === artigoIdx ? { ...a, ...patch } : a));
      return { ...p, artigos };
    }));
  }

  function addArtigo(paleteIdx: number) {
    setPaletes((prev) => prev.map((p, pi) => {
      if (pi !== paleteIdx) return p;
      return { ...p, artigos: [...p.artigos, { ...EMPTY_ARTIGO }] };
    }));
  }

  function removeArtigo(paleteIdx: number, artigoIdx: number) {
    setPaletes((prev) => prev.map((p, pi) => {
      if (pi !== paleteIdx) return p;
      const artigos = p.artigos.filter((_, ai) => ai !== artigoIdx);
      return { ...p, artigos: artigos.length > 0 ? artigos : [{ ...EMPTY_ARTIGO }] };
    }));
  }

  function limparPalete(i: number) {
    setPaletes((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, artigos: [{ ...EMPTY_ARTIGO }] } : p))
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const estado = form.get("estado") as string;
    const duracaoMin = Number(form.get("duracao_min") || defaultDur);
    const agora = new Date();

    const paletesDetalhe: PaleteDetalhe[] = paletes
      .filter((p) => p.artigos.some((a) => a.referencia.trim().length > 0))
      .map((p) => {
        const artigos: ArtigoPalete[] = p.artigos
          .filter((a) => a.referencia.trim().length > 0)
          .map((a) => ({
            referencia: a.referencia.trim(),
            op_numero: a.op_numero.trim() || null,
            quantidade: a.quantidade.trim() ? Number(a.quantidade) : null,
            cliente: a.cliente.trim() || null,
          }));
        return {
          posicao: p.posicao,
          conteudo: artigos.map((a) => a.referencia).join(", "),
          op_numero: artigos[0]?.op_numero ?? null,
          quantidade: artigos.reduce((s, a) => s + (a.quantidade ?? 0), 0) || null,
          cliente: artigos[0]?.cliente ?? null,
          artigos,
        };
      });

    const data: Record<string, unknown> = {
      zona_id: zonaId,
      estado,
      conteudo: (form.get("conteudo") as string) || null,
      paletes: paletesDetalhe.length || null,
      paletes_detalhe: paletesDetalhe,
      temperatura: form.get("temperatura") ? Number(form.get("temperatura")) : null,
      notas: (form.get("notas") as string) || null,
    };

    if (estado === "em_ciclo" && (!editItem || editItem.estado !== "em_ciclo")) {
      data.inicio = agora.toISOString();
      data.fim_previsto = new Date(agora.getTime() + duracaoMin * 60_000).toISOString();
      data.fim_real = null;
    } else if (estado === "concluido" && editItem?.estado === "em_ciclo") {
      data.fim_real = agora.toISOString();
    } else if (estado === "vazio") {
      data.inicio = null;
      data.fim_previsto = null;
      data.fim_real = null;
      data.conteudo = null;
      data.paletes = null;
      data.paletes_detalhe = [];
    }

    let error;
    if (editItem) {
      ({ error } = await supabase.from("equipamento_ciclo").update(data).eq("id", editItem.id));
    } else {
      ({ error } = await supabase.from("equipamento_ciclo").insert(data));
    }

    setLoading(false);
    if (error) {
      toast.error("Erro ao guardar ciclo");
      return;
    }
    toast.success("Ciclo atualizado");
    onOpenChange(false);
  }

  async function apagar() {
    if (!editItem) return;
    if (!confirm("Tem a certeza que quer apagar este ciclo?")) return;
    const { error } = await supabase.from("equipamento_ciclo").delete().eq("id", editItem.id);
    if (error) toast.error("Erro ao apagar ciclo");
    else {
      toast.success("Ciclo apagado");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-200 bg-white text-slate-900 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ZONA_LABEL[zonaId]} — Ciclo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="estado">Estado</Label>
              <Select name="estado" defaultValue={editItem?.estado ?? "em_ciclo"}>
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
              <Label htmlFor="conteudo">Lote / Identificação</Label>
              <Input id="conteudo" name="conteudo" defaultValue={editItem?.conteudo ?? ""} placeholder="ex: Lote EST-26-014" className="mt-1" />
            </div>
          </div>

          {/* Paletes */}
          <div>
            <div className="flex items-center justify-between">
              <Label>Paletes ({paletes.filter((p) => p.artigos.some((a) => a.referencia.trim())).length}/{capacidade})</Label>
              <span className="text-[10px] font-bold text-slate-400">Deixar vazio = palete livre</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {paletes.map((p, pi) => {
                const preenchida = p.artigos.some((a) => a.referencia.trim().length > 0);
                return (
                  <div
                    key={p.posicao}
                    className={cn(
                      "rounded-lg border-2 p-2",
                      preenchida ? "border-emerald-300 bg-emerald-50" : "border-dashed border-slate-200 bg-slate-50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "rounded-md px-1.5 py-0.5 text-[11px] font-black",
                        preenchida ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
                      )}>
                        P{p.posicao}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => addArtigo(pi)}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
                        >
                          + artigo
                        </button>
                        {preenchida && (
                          <button
                            type="button"
                            onClick={() => limparPalete(pi)}
                            className="text-[10px] font-bold text-slate-500 hover:text-red-600"
                          >
                            limpar
                          </button>
                        )}
                      </div>
                    </div>
                    {p.artigos.map((a, ai) => (
                      <div key={ai} className={cn("mt-1", ai > 0 && "border-t border-slate-200 pt-1")}>
                        {p.artigos.length > 1 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-slate-400">Artigo {ai + 1}</span>
                            <button
                              type="button"
                              onClick={() => removeArtigo(pi, ai)}
                              className="text-[9px] font-bold text-red-400 hover:text-red-600"
                            >
                              remover
                            </button>
                          </div>
                        )}
                        <input
                          type="text"
                          value={a.referencia}
                          onChange={(e) => updateArtigo(pi, ai, { referencia: e.target.value })}
                          placeholder="Ref / conteúdo"
                          className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 placeholder:text-slate-400"
                        />
                        <div className="mt-1 grid grid-cols-2 gap-1">
                          <input
                            type="text"
                            value={a.op_numero}
                            onChange={(e) => updateArtigo(pi, ai, { op_numero: e.target.value })}
                            placeholder="OP"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-900 placeholder:text-slate-400"
                          />
                          <input
                            type="number"
                            value={a.quantidade}
                            onChange={(e) => updateArtigo(pi, ai, { quantidade: e.target.value })}
                            placeholder="Qtd"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-900 placeholder:text-slate-400"
                          />
                        </div>
                        <input
                          type="text"
                          value={a.cliente}
                          onChange={(e) => updateArtigo(pi, ai, { cliente: e.target.value })}
                          placeholder="Cliente"
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-900 placeholder:text-slate-400"
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="duracao_min">Duração (min)</Label>
              <Input id="duracao_min" name="duracao_min" type="number" min={1} defaultValue={defaultDur} className="mt-1" />
              <p className="mt-1 text-[10px] font-bold text-slate-400">
                Só aplicado se arrancar novo ciclo
              </p>
            </div>
            <div>
              <Label htmlFor="temperatura">Temperatura (°C)</Label>
              <Input id="temperatura" name="temperatura" type="number" step="0.1" defaultValue={editItem?.temperatura ?? ""} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" name="notas" rows={2} defaultValue={editItem?.notas ?? ""} className="mt-1" />
          </div>
          <div className="mt-2 flex gap-2">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "A guardar..." : "Guardar"}
            </Button>
            {editItem && (
              <Button type="button" variant="secondary" onClick={apagar} className="bg-red-100 text-red-700 hover:bg-red-200">
                Apagar
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
