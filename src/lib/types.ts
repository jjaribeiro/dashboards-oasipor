export interface Concurso {
  id: string;
  numero_dossier: string | null;
  nome_procedimento: string | null;
  titulo: string;
  cliente: string;
  prazo: string;
  data_submissao: string | null;
  valor: number | null;
  tipo: "publico" | "privado";
  estado: "por_submeter" | "em_preparacao" | "submetido";
  vendedor: string | null;
  responsavel: string | null;
  numero_cliente: string | null;
  zona: string | null;
  notas: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Cotacao {
  id: string;
  numero_dossier: string | null;
  nome_procedimento: string | null;
  cliente: string;
  descricao: string;
  prazo: string | null;
  valor: number | null;
  estado: "por_enviar" | "enviado" | "follow_up";
  vendedor: string | null;
  responsavel: string | null;
  numero_cliente: string | null;
  zona: string | null;
  notas: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Encomenda {
  id: string;
  numero_dossier: string | null;
  cliente: string;
  numero_encomenda: string | null;
  valor: number | null;
  data_encomenda: string | null;
  descricao_itens: string | null;
  estado: string | null;
  vendedor: string | null;
  responsavel: string | null;
  numero_cliente: string | null;
  zona: string | null;
  notas: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tarefa {
  id: string;
  numero_dossier: string | null;
  nome_procedimento: string | null;
  descricao: string;
  cliente: string | null;
  prioridade: "alta" | "media" | "baixa";
  data_hora: string | null;
  tipo: "follow_up" | "tarefa" | "reuniao" | "reuniao_comercial" | "follow_up_cotacao" | "pedido_esclarecimento" | "pronuncia";
  vendedor: string | null;
  responsavel: string | null;
  notas: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Amostra {
  id: string;
  numero_dossier: string | null;
  nome_procedimento: string | null;
  cliente: string;
  numero_cliente: string | null;
  descricao: string;
  data_expedicao: string | null;
  estado: string | null;
  vendedor: string | null;
  responsavel: string | null;
  zona: string | null;
  notas: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TableName = "concursos" | "cotacoes" | "encomendas" | "tarefas" | "amostras";

// ============ PRODUÇÃO ============

export type ZonaId =
  | "sl1"
  | "sl2_picking"
  | "sl2_manual"
  | "sl2_termo"
  | "embalamento"
  | "pre_cond_1"
  | "pre_cond_2"
  | "esterilizador"
  | "arejamento_1"
  | "arejamento_2";

export type AreaProducao =
  | "sala_limpa_1"
  | "sala_limpa_2"
  | "esterilizacao"
  | "embalamento";

export type TipoZona = "producao" | "picking" | "linha" | "camara" | "esterilizador";

export interface ZonaProducao {
  id: ZonaId;
  nome: string;
  area: AreaProducao;
  ordem: number;
  tipo: TipoZona;
  responsavel: string | null;
  created_at: string;
}

export type CategoriaProduto =
  | "campos_cirurgicos"
  | "laminado"
  | "mascaras"
  | "toucas"
  | "cobre_sapatos"
  | "pack"
  | "outros";

export interface Produto {
  id: string;
  nome: string;
  categoria: CategoriaProduto;
  sku: string | null;
  unidade: string | null;
  created_at: string;
}

export interface Funcionario {
  id: string;
  nome: string;
  iniciais: string | null;
  cor: string | null;
  zona_atual: ZonaId | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export type EstadoOP = "planeada" | "em_curso" | "pausada" | "concluida" | "cancelada";
export type PrioridadeOP = "baixa" | "normal" | "alta" | "urgente";

export interface OrdemProducao {
  id: string;
  numero: string | null;
  zona_id: ZonaId;
  produto_id: string | null;
  produto_codigo: string | null;
  produto_nome: string;
  cliente: string | null;
  quantidade_alvo: number;
  quantidade_atual: number;
  estado: EstadoOP;
  prioridade: PrioridadeOP;
  inicio: string | null;
  fim_previsto: string | null;
  fim_real: string | null;
  responsavel: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type EstadoCiclo = "vazio" | "em_ciclo" | "concluido" | "alarme";

export interface PaleteDetalhe {
  posicao: number;
  conteudo: string;
  op_numero?: string | null;
  quantidade?: number | null;
  cliente?: string | null;
}

export interface EquipamentoCiclo {
  id: string;
  zona_id: ZonaId;
  estado: EstadoCiclo;
  conteudo: string | null;
  paletes: number | null;
  paletes_detalhe: PaleteDetalhe[] | null;
  inicio: string | null;
  fim_previsto: string | null;
  fim_real: string | null;
  temperatura: number | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}
