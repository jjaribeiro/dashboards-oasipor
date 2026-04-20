export const COLUMN_CONFIG = {
  concursos: {
    title: "Concursos por Submeter",
    accent: "blue",
    icon: "📋",
  },
  cotacoes: {
    title: "Cotações Pendentes",
    accent: "purple",
    icon: "💰",
  },
  encomendas: {
    title: "Encomendas em Standby",
    accent: "amber",
    icon: "📦",
  },
  tarefas: {
    title: "Tarefas / Follow-ups",
    accent: "emerald",
    icon: "✅",
  },
  amostras: {
    title: "Amostras por Expedir",
    accent: "rose",
    icon: "🧪",
  },
} as const;

export const ESTADO_CONCURSO: Record<string, string> = {
  por_submeter: "Por Submeter",
  em_preparacao: "Em Preparação",
  submetido: "Submetido",
};

export const ESTADO_COTACAO: Record<string, string> = {
  por_enviar: "Por Enviar",
  enviado: "Enviado",
  follow_up: "Follow-up",
};

export const PRIORIDADE_LABELS: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const TIPO_TAREFA: Record<string, string> = {
  follow_up: "Follow-up",
  follow_up_cotacao: "Follow-up Cotação",
  tarefa: "Tarefa",
  reuniao: "Reunião",
  reuniao_comercial: "Reunião Comercial",
  pedido_esclarecimento: "Pedido de Esclarecimento",
  pronuncia: "Pronúncia",
};

export const TIPO_CONCURSO: Record<string, string> = {
  publico: "Público",
  privado: "Privado",
};

export const RESPONSAVEIS = ["Joana Romão", "Ana Leal"] as const;

// ============ PRODUÇÃO ============

export const ZONA_LABEL: Record<string, string> = {
  sl1_campos: "SL1 — Máq. Campos",
  sl1_laminados: "SL1 — Laminados",
  sl1_mascaras: "SL1 — Máscaras",
  sl1_toucas: "SL1 — Toucas",
  sl1_outros: "SL1 — Outros",
  sl2_picking: "SL2 — Picking",
  sl2_manual: "SL2 — Manual",
  sl2_termo: "SL2 — Termo",
  sl2_embalamento: "SL2 — Embalamento",
  pre_cond_1: "Pré-Condicionamento 1",
  pre_cond_2: "Pré-Condicionamento 2",
  esterilizador: "Esterilizador",
  arejamento_1: "Arejamento 1",
  arejamento_2: "Arejamento 2",
};

export const ZONA_LABEL_CURTO: Record<string, string> = {
  sl1_campos: "SL1 Campos",
  sl1_laminados: "SL1 Lamin.",
  sl1_mascaras: "SL1 Másc.",
  sl1_toucas: "SL1 Toucas",
  sl1_outros: "SL1 Outros",
  sl2_picking: "SL2 Picking",
  sl2_manual: "SL2 Manual",
  sl2_termo: "SL2 Termo",
  sl2_embalamento: "SL2 Embal.",
  pre_cond_1: "Pré-Cond 1",
  pre_cond_2: "Pré-Cond 2",
  esterilizador: "Esteril.",
  arejamento_1: "Arej 1",
  arejamento_2: "Arej 2",
};

export const ZONA_COR: Record<string, string> = {
  sl1_campos: "bg-sky-100 text-sky-700 border-sky-300",
  sl1_laminados: "bg-blue-100 text-blue-700 border-blue-300",
  sl1_mascaras: "bg-cyan-100 text-cyan-700 border-cyan-300",
  sl1_toucas: "bg-teal-100 text-teal-700 border-teal-300",
  sl1_outros: "bg-slate-100 text-slate-700 border-slate-300",
  sl2_picking: "bg-violet-100 text-violet-700 border-violet-300",
  sl2_manual: "bg-amber-100 text-amber-700 border-amber-300",
  sl2_termo: "bg-orange-100 text-orange-700 border-orange-300",
  sl2_embalamento: "bg-yellow-100 text-yellow-700 border-yellow-300",
  pre_cond_1: "bg-indigo-100 text-indigo-700 border-indigo-300",
  pre_cond_2: "bg-indigo-100 text-indigo-700 border-indigo-300",
  esterilizador: "bg-rose-100 text-rose-700 border-rose-300",
  arejamento_1: "bg-pink-100 text-pink-700 border-pink-300",
  arejamento_2: "bg-pink-100 text-pink-700 border-pink-300",
};

export const AREA_LABEL: Record<string, string> = {
  sala_limpa_1: "SL1",
  sala_limpa_2: "SL2",
  esterilizacao: "EO",
};

export const AREA_COR: Record<string, string> = {
  sala_limpa_1: "bg-sky-100 text-sky-700 border-sky-200",
  sala_limpa_2: "bg-indigo-100 text-indigo-700 border-indigo-200",
  esterilizacao: "bg-rose-100 text-rose-700 border-rose-200",
};

export const CATEGORIA_PRODUTO_LABEL: Record<string, string> = {
  campos_cirurgicos: "Campos Cirúrgicos",
  laminado: "Laminado",
  mascaras: "Máscaras",
  toucas: "Toucas",
  cobre_sapatos: "Cobre-Sapatos",
  pack: "Pack Cirúrgico",
  outros: "Outros",
};

export const ESTADO_OP_LABEL: Record<string, string> = {
  planeada: "Planeada",
  em_curso: "Em Curso",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const ESTADO_OP_COR: Record<string, string> = {
  planeada: "bg-slate-100 text-slate-700 border-slate-200",
  em_curso: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pausada: "bg-yellow-100 text-yellow-800 border-yellow-200",
  concluida: "bg-blue-100 text-blue-700 border-blue-200",
  cancelada: "bg-slate-100 text-slate-400 border-slate-200",
};

export const ESTADO_PEDIDO_LABEL: Record<string, string> = {
  pendente: "Pendente",
  programado: "Programado",
  em_producao: "Em Produção",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const ESTADO_PEDIDO_COR: Record<string, string> = {
  pendente: "bg-slate-100 text-slate-700 border-slate-200",
  programado: "bg-sky-100 text-sky-700 border-sky-200",
  em_producao: "bg-emerald-100 text-emerald-700 border-emerald-200",
  concluido: "bg-blue-100 text-blue-700 border-blue-200",
  cancelado: "bg-slate-100 text-slate-400 border-slate-200",
};

export const PRIORIDADE_OP_LABEL: Record<string, string> = {
  por_definir: "Por definir",
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const PRIORIDADE_OP_COR: Record<string, string> = {
  por_definir: "bg-slate-50 text-slate-400 border-slate-200 italic",
  baixa: "bg-slate-100 text-slate-600 border-slate-200",
  normal: "bg-sky-100 text-sky-700 border-sky-200",
  alta: "bg-orange-100 text-orange-700 border-orange-200",
  urgente: "bg-red-100 text-red-700 border-red-200",
};

export const ESTADO_CICLO_LABEL: Record<string, string> = {
  vazio: "Vazio",
  em_ciclo: "Em Ciclo",
  concluido: "Concluído",
  alarme: "Alarme",
};

export const ESTADO_CICLO_COR: Record<string, string> = {
  vazio: "bg-slate-100 text-slate-500 border-slate-200",
  em_ciclo: "bg-emerald-100 text-emerald-700 border-emerald-200",
  concluido: "bg-blue-100 text-blue-700 border-blue-200",
  alarme: "bg-red-100 text-red-700 border-red-200",
};

// Durações típicas (minutos) — defaults para os forms de início de ciclo
export const DURACAO_DEFAULT_MIN: Record<string, number> = {
  pre_cond_1: 24 * 60,      // 24 h
  pre_cond_2: 24 * 60,
  esterilizador: 10 * 60,   // 10 h
  arejamento_1: 24 * 60,    // 24 h
  arejamento_2: 24 * 60,
};

export const ZONAS_ORDEM: Array<{ id: string; nome: string; area: string }> = [
  { id: "sl1", nome: "SL1", area: "sala_limpa_1" },
  { id: "sl2_picking", nome: "SASC — Picking", area: "sala_limpa_2" },
  { id: "sl2_manual", nome: "SL2 — Manual", area: "sala_limpa_2" },
  { id: "sl2_termo", nome: "SL2 — Termoformadora", area: "sala_limpa_2" },
  { id: "embalamento", nome: "Embalamento", area: "embalamento" },
  { id: "stock", nome: "Stock", area: "embalamento" },
  { id: "pre_cond_1", nome: "Pré-Condicionamento 1", area: "esterilizacao" },
  { id: "pre_cond_2", nome: "Pré-Condicionamento 2", area: "esterilizacao" },
  { id: "esterilizador", nome: "Esterilizador", area: "esterilizacao" },
  { id: "arejamento_1", nome: "Arejamento 1", area: "esterilizacao" },
  { id: "arejamento_2", nome: "Arejamento 2", area: "esterilizacao" },
];

/** Zonas disponíveis no form de OPs (sem esterilização) */
export const ZONAS_OP: Array<{ id: string; nome: string }> = [
  { id: "sl1", nome: "SL1" },
  { id: "sl2_picking", nome: "SASC — Picking" },
  { id: "sl2_linhas", nome: "SL2 — Linhas" },
  { id: "embalamento", nome: "Embalamento" },
];

export const TIPO_LINHA_LABEL: Record<string, string> = {
  manual: "Manual",
  termoformadora: "Termoformadora",
  stock: "Stock",
};

export const TIPO_LINHA_OPTIONS: Array<{ id: string; nome: string }> = [
  { id: "manual", nome: "Manual" },
  { id: "termoformadora", nome: "Termoformadora" },
  { id: "stock", nome: "Stock" },
];

export const MOTIVOS_PAUSA: Array<{ id: string; label: string; icon: string }> = [
  { id: "pausa_cafe", label: "Pausa / Café", icon: "☕" },
  { id: "almoco", label: "Almoço", icon: "🍽" },
  { id: "reuniao", label: "Reunião", icon: "👥" },
  { id: "falta_materia", label: "Falta de matéria-prima", icon: "📦" },
  { id: "avaria_equipamento", label: "Avaria de equipamento", icon: "🔧" },
  { id: "manutencao", label: "Manutenção", icon: "🛠" },
  { id: "limpeza", label: "Limpeza", icon: "🧹" },
  { id: "troca_turno", label: "Troca de turno", icon: "🔄" },
  { id: "outro", label: "Outro", icon: "❓" },
];

export const MOTIVOS_REJEITO: Array<{ id: string; label: string; icon: string }> = [
  { id: "defeito_material", label: "Defeito no material", icon: "❌" },
  { id: "erro_embalamento", label: "Erro de embalamento", icon: "📦" },
  { id: "contaminacao", label: "Contaminação", icon: "⚠" },
  { id: "dimensao_errada", label: "Dimensão errada", icon: "📏" },
  { id: "selagem_defeituosa", label: "Selagem defeituosa", icon: "🔗" },
  { id: "marcacao_errada", label: "Marcação errada", icon: "🏷" },
  { id: "outro", label: "Outro", icon: "❓" },
];
