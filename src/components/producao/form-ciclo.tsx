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
import type { EquipamentoCiclo, PaleteDetalhe } from "@/lib/types";

interface FormCicloProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: EquipamentoCiclo | null;
  zonaId: string;
  isEsterilizador?: boolean;
}

type PaleteEditavel = {
  posicao: number;
  conteudo: string;
  op_numero: string;
  quantidade: string;
  cliente: string;
};

function initPaletes(item: EquipamentoCiclo | null | undefined, capacidade: number): PaleteEditavel[] {
  const existentes = new Map<number, PaleteDetalhe>();
  (item?.paletes_detalhe ?? []).forEach((p) => existentes.set(p.posicao, p));
  return Array.from({ length: capacidade }, (_, i) => {
    const p = existentes.get(i + 1);
    return {
      posicao: i + 1,
      conteudo: p?.conteudo ?? "",
      op_numero: p?.op_numero ?? "",
      quantidade: p?.quantidade != null ? String(p.quantidade) : "",
      cliente: p?.cliente ?? "",
    };
  });
}

export function FormCiclo({ open, onOpenChange, editItem, zonaId, isEsterilizador }: FormCicloProps) {
  const [loading, setLoading] = useState(false);
  const defaultDur = DURACAO_DEFAULT_MIN[zonaId] ?? 60;
  const capacidade = isEsterilizador ? 8 : Math.max(editItem?.paletes_detalhe?.length ?? 8, 8);
  const [paletes, setPaletes] = useState<PaleteEditavel[]>(() => initPaletes(editItem, capacidade));

  function updatePalete(i: number, patch: Partial<PaleteEditavel>) {
    setPaletes((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function limparPalete(i: number) {
    setPaletes((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, conteudo: "", op_numero: "", quantidade: "", cliente: "" } : p))
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
      .filter((p) => p.conteudo.trim().length > 0)
      .map((p) => ({
        posicao: p.posicao,
        conteudo: p.conteudo.trim(),
        op_numero: p.op_numero.trim() || null,
        quantidade: p.quantidade.trim() ? Number(p.quantidade) : null,
        cliente: p.cliente.trim() || null,
      }));

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
              <Label>Paletes ({paletes.filter((p) => p.conteudo.trim()).length}/{capacidade})</Label>
              <span className="text-[10px] font-bold text-slate-400">Deixar vazio = palete livre</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {paletes.map((p, i) => {
                const preenchida = p.conteudo.trim().length > 0;
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
                      {preenchida && (
                        <button
                          type="button"
                          onClick={() => limparPalete(i)}
                          className="text-[10px] font-bold text-slate-500 hover:text-red-600"
                        >
                          limpar
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={p.conteudo}
                      onChange={(e) => updatePalete(i, { conteudo: e.target.value })}
                      placeholder="Conteúdo / ref"
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 placeholder:text-slate-400"
                    />
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      <input
                        type="text"
                        value={p.op_numero}
                        onChange={(e) => updatePalete(i, { op_numero: e.target.value })}
                        placeholder="OP"
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-900 placeholder:text-slate-400"
                      />
                      <input
                        type="number"
                        value={p.quantidade}
                        onChange={(e) => updatePalete(i, { quantidade: e.target.value })}
                        placeholder="Qtd"
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                    <input
                      type="text"
                      value={p.cliente}
                      onChange={(e) => updatePalete(i, { cliente: e.target.value })}
                      placeholder="Cliente"
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-900 placeholder:text-slate-400"
                    />
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
          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? "A guardar..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
