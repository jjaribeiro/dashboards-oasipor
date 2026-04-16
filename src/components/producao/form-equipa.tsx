"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { ZONA_LABEL } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Funcionario } from "@/lib/types";

interface FormEquipaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zonaId: string;
  funcionarios: Funcionario[];
}

export function FormEquipa({ open, onOpenChange, zonaId, funcionarios }: FormEquipaProps) {
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");

  async function toggle(f: Funcionario) {
    const nova = f.zona_atual === zonaId ? null : zonaId;
    const { error } = await supabase.from("funcionarios").update({ zona_atual: nova }).eq("id", f.id);
    if (error) toast.error("Erro a atribuir");
  }

  async function criar() {
    if (!newName.trim()) return;
    setLoading(true);
    const iniciais = newName.trim().split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
    const { error } = await supabase.from("funcionarios").insert({
      nome: newName.trim(),
      iniciais,
      cor: "#64748b",
      zona_atual: zonaId,
    });
    setLoading(false);
    if (error) toast.error("Erro a criar funcionário");
    else {
      toast.success("Funcionário adicionado");
      setNewName("");
    }
  }

  const nestaZona = funcionarios.filter((f) => f.zona_atual === zonaId);
  const outros = funcionarios.filter((f) => f.zona_atual !== zonaId && f.ativo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Equipa — {ZONA_LABEL[zonaId]}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label className="text-xs">Nesta zona ({nestaZona.length})</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {nestaZona.length === 0 && <span className="text-xs font-bold text-slate-400 italic">— ninguém atribuído —</span>}
              {nestaZona.map((f) => (
                <button
                  key={f.id}
                  onClick={() => toggle(f)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100"
                  title="Retirar"
                >
                  <span
                    className="inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-extrabold text-white"
                    style={{ backgroundColor: f.cor ?? "#64748b" }}
                  >
                    {f.iniciais}
                  </span>
                  {f.nome}
                  <span className="text-emerald-600">×</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Disponíveis</Label>
            <div className="mt-1 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
              {outros.map((f) => (
                <button
                  key={f.id}
                  onClick={() => toggle(f)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
                  )}
                  title="Atribuir"
                >
                  <span
                    className="inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-extrabold text-white"
                    style={{ backgroundColor: f.cor ?? "#64748b" }}
                  >
                    {f.iniciais}
                  </span>
                  {f.nome}
                  {f.zona_atual && (
                    <span className="text-[10px] text-slate-400">({ZONA_LABEL[f.zona_atual] ?? f.zona_atual})</span>
                  )}
                  <span className="text-slate-400">+</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <Label htmlFor="newName" className="text-xs">Adicionar novo funcionário</Label>
            <div className="mt-1 flex gap-2">
              <Input id="newName" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome completo" />
              <Button onClick={criar} disabled={loading || !newName.trim()}>Adicionar</Button>
            </div>
          </div>

          <Button variant="secondary" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
