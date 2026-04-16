"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { RESPONSAVEIS } from "@/lib/constants";
import { toast } from "sonner";
import type { Concurso } from "@/lib/types";

interface FormConcursoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: Concurso | null;
}

export function FormConcurso({ open, onOpenChange, editItem }: FormConcursoProps) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const data = {
      numero_dossier: (form.get("numero_dossier") as string) || null,
      nome_procedimento: (form.get("nome_procedimento") as string) || null,
      titulo: form.get("titulo") as string,
      cliente: form.get("cliente") as string,
      prazo: form.get("prazo") as string,
      valor: form.get("valor") ? Number(form.get("valor")) : null,
      tipo: form.get("tipo") as string,
      estado: form.get("estado") as string,
      vendedor: (form.get("vendedor") as string) || null,
      responsavel: (form.get("responsavel") as string) || null,
      notas: (form.get("notas") as string) || null,
    };

    let error;
    if (editItem) {
      ({ error } = await supabase.from("concursos").update(data).eq("id", editItem.id));
    } else {
      ({ error } = await supabase.from("concursos").insert(data));
    }

    setLoading(false);
    if (error) {
      toast.error("Erro ao guardar concurso");
      return;
    }
    toast.success(editItem ? "Concurso atualizado" : "Concurso adicionado");
    onOpenChange(false);
  }

  const defaultPrazo = editItem?.prazo
    ? new Date(editItem.prazo).toISOString().slice(0, 16)
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editItem ? "Editar Concurso" : "Novo Concurso"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="numero_dossier">N.º Dossier Oasipor</Label>
              <Input id="numero_dossier" name="numero_dossier" defaultValue={editItem?.numero_dossier ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="nome_procedimento">Nome Procedimento</Label>
              <Input id="nome_procedimento" name="nome_procedimento" defaultValue={editItem?.nome_procedimento ?? ""} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="titulo">Título *</Label>
            <Input id="titulo" name="titulo" required defaultValue={editItem?.titulo} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cliente">Entidade (Hospital/Cliente) *</Label>
            <Input id="cliente" name="cliente" required defaultValue={editItem?.cliente} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="prazo">Data Limite *</Label>
            <Input id="prazo" name="prazo" type="datetime-local" required defaultValue={defaultPrazo} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="valor">Valor (EUR)</Label>
              <Input id="valor" name="valor" type="number" step="0.01" defaultValue={editItem?.valor ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="tipo">Tipo</Label>
              <Select name="tipo" defaultValue={editItem?.tipo ?? "publico"}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="publico">Público</SelectItem>
                  <SelectItem value="privado">Privado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="estado">Estado</Label>
            <Select name="estado" defaultValue={editItem?.estado ?? "por_submeter"}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="por_submeter">Por Submeter</SelectItem>
                <SelectItem value="em_preparacao">Em Preparação</SelectItem>
                <SelectItem value="submetido">Submetido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="vendedor">Comercial</Label>
            <Input id="vendedor" name="vendedor" defaultValue={editItem?.vendedor ?? ""} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="responsavel">Responsável (Back Office)</Label>
            <select
              id="responsavel"
              name="responsavel"
              defaultValue={editItem?.responsavel ?? ""}
              className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">—</option>
              {RESPONSAVEIS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" name="notas" rows={2} defaultValue={editItem?.notas ?? ""} className="mt-1" />
          </div>
          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? "A guardar..." : editItem ? "Guardar" : "Adicionar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
