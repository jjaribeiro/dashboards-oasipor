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

export interface Pessoa {
  id: string;
  nome: string;
  pin: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  acao: string;
  alvo_tabela: string | null;
  alvo_id: string | null;
  zona_id: string | null;
  detalhes: Record<string, unknown> | null;
  created_at: string;
}

// ============ PRODUÇÃO ============

export type ZonaId =
  | "sl1_campos"
  | "sl1_laminados"
  | "sl1_mascaras"
  | "sl1_toucas"
  | "sl1_outros"
  | "sl2_picking"
  | "sl2_manual"
  | "sl2_termo"
  | "sl2_embalamento"
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
  meta_diaria_un: number | null;
  meta_horaria_un: number | null;
  duracao_ciclo_min: number | null;
  created_at: string;
}

export type CategoriaMeta = "packs_trouxas" | "campos_cirurgicos";

export interface MetaCategoria {
  categoria: CategoriaMeta;
  meta_diaria_un: number | null;
  meta_semanal_un: number | null;
  meta_mensal_un: number | null;
  updated_at: string;
}

export type TipoCaixa = "termo" | "manual";

export interface Produto {
  id: string;
  referencia: string;
  descricao: string;
  tipo: string | null;
  tipo_caixa: TipoCaixa | null;
  qtd_por_caixa: number | null;
  created_at: string;
  updated_at: string;
}

export type EstadoPaleteEO =
  | "planeamento"
  | "fechada"
  | "em_pre_cond"
  | "em_eo"
  | "em_arejamento"
  | "concluida"
  | "cancelada";

export interface PaleteEO {
  id: string;
  numero: number; // 1-8
  tipo_caixa: TipoCaixa | null;
  estado: EstadoPaleteEO;
  ciclo_id: string | null;
  fechada_em: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface Funcionario {
  id: string;
  nome: string;
  iniciais: string | null;
  cor: string | null;
  zona_atual: ZonaId | null;
  ativo: boolean;
  email: string | null;
  departamento: string | null;
  funcao: string | null;
  acessos: string[];
  pin: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscalaFuncionario {
  id: string;
  funcionario_id: string;
  data: string; // YYYY-MM-DD
  zona_id: ZonaId;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type TipoPresenca = "entrada" | "pausa_inicio" | "pausa_fim" | "saida";
export type EstadoPresenca = "ausente" | "presente" | "em_pausa";

export interface FuncionarioPresenca {
  id: string;
  funcionario_id: string;
  funcionario_nome: string;
  zona_id: ZonaId | null;
  tipo: TipoPresenca;
  motivo: string | null;
  notas: string | null;
  criado_em: string;
}

export type EstadoOP = "planeada" | "em_curso" | "pausada" | "concluida" | "cancelada";
export type PrioridadeOP = "por_definir" | "baixa" | "normal" | "alta" | "urgente";
export type TipoLinha = "manual" | "termoformadora" | "stock" | "campos" | "laminados" | "mascaras" | "toucas" | "outros" | null;
export type CategoriaProduto = "campo" | "trouxa" | "pack" | "outros";
export type EstadoPedido = "pendente" | "programado" | "em_producao" | "concluido" | "cancelado";

export type StockStatus = "ok" | "pendente";

export interface PedidoProducao {
  id: string;
  numero: string | null;
  ficha_producao: string | null; // do Excel "Ficha de Produção"
  produto_id: string | null;
  produto_codigo: string | null;
  produto_nome: string;
  cliente: string | null;
  comercial: string | null;
  categoria: CategoriaProduto | null;
  tipo_linha: TipoLinha;
  quantidade_alvo: number;
  quantidade_por_caixa: number | null;
  qtd_total_pp: number | null; // qty total do Pedido de Produção (do Excel "Qtd_ped" / "Qtd PP")
  qtd_pendente_pp: number | null; // qty que ainda falta produzir do PP (do Excel "Pendente")
  stock_existente: number | null; // qty em stock (do Excel "Stock")
  reservas_existentes: number | null; // qty reservada para outros pedidos (do Excel "Reservas")
  consumos_6m: number | null; // consumos últimos 6 meses (do Excel "Consumos6m")
  stock_status: StockStatus | null; // indicador manual ou inferido: stock OK ou Pendente
  prioridade: PrioridadeOP;
  inicio_previsto: string | null;
  fim_previsto: string | null; // deadline do cliente (do Excel)
  data_agendada: string | null; // dia alvo de produção definido pelo "Programar Tudo"
  data_fim_agendada: string | null; // último dia em que o pedido ocupa a grelha (multi-dia). Se null, ocupa só data_agendada.
  precisa_rotulagem: boolean;
  inicio_real: string | null;
  fim_real: string | null;
  estado: EstadoPedido;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrdemProducao {
  id: string;
  numero: string | null;
  pedido_id: string | null;
  zona_id: ZonaId;
  produto_id: string | null;
  produto_codigo: string | null;
  produto_nome: string;
  lote: string | null;
  cliente: string | null;
  categoria: CategoriaProduto | null;
  quantidade_alvo: number;
  quantidade_atual: number;
  quantidade_rejeitada: number;
  ordem_fila: number | null;
  motivo_pausa: string | null;
  pausada_em: string | null;
  estado: EstadoOP;
  prioridade: PrioridadeOP;
  tipo_linha: TipoLinha;
  inicio: string | null;
  inicio_previsto: string | null;
  fim_previsto: string | null;
  fim_real: string | null;
  responsavel: string | null;
  notas: string | null;
  op_anterior_id: string | null;
  bloqueada: boolean;
  palete_eo_id: string | null;
  num_caixas: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProducaoRejeito {
  id: string;
  op_id: string;
  zona_id: string | null;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  quantidade: number;
  motivo: string;
  notas: string | null;
  created_at: string;
}

export interface ProducaoPausa {
  id: string;
  op_id: string;
  zona_id: string | null;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  motivo: string;
  inicio: string;
  fim: string | null;
  duracao_min: number | null;
  notas: string | null;
  created_at: string;
}

export type ResultadoRotulagem = "aprovado" | "reetiquetar" | "descartar" | "pendente";

export interface RotulagemInspecao {
  id: string;
  op_id: string | null;
  pedido_id: string | null;
  lote: string | null;
  check_lote: boolean;
  check_validade: boolean;
  check_ref_cliente: boolean;
  check_idioma: boolean;
  check_quantidade: boolean;
  resultado: ResultadoRotulagem;
  qtd_reetiquetada: number;
  qtd_descartada: number;
  foto_url: string | null;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type ResultadoCq = "aprovado" | "rejeitado" | "condicionado" | "pendente";

export interface CqChecklistItem {
  descricao: string;
  ok: boolean;
}

export interface CqInspecao {
  id: string;
  op_id: string | null;
  pedido_id: string | null;
  produto_codigo: string | null;
  tamanho_amostra: number;
  checklist: CqChecklistItem[];
  resultado: ResultadoCq;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type SeveridadeNc = "baixa" | "media" | "alta" | "critica";
export type EstadoNc = "aberta" | "em_analise" | "em_correcao" | "fechada" | "cancelada";
export type TipoNc = "produto" | "processo" | "rotulagem" | "embalamento" | "esterilizacao" | "fornecedor" | "outros";

export interface NaoConformidade {
  id: string;
  numero: string | null;
  op_id: string | null;
  pedido_id: string | null;
  zona_id: string | null;
  tipo: TipoNc | null;
  severidade: SeveridadeNc;
  descricao: string;
  causa_raiz: string | null;
  acao_corretiva: string | null;
  responsavel: string | null;
  prazo: string | null;
  qtd_afetada: number;
  estado: EstadoNc;
  bloqueia_op: boolean;
  detetado_por_pessoa_id: string | null;
  detetado_por_pessoa_nome: string | null;
  fechada_em: string | null;
  fechada_por_pessoa_id: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type EstadoCiclo = "vazio" | "em_ciclo" | "concluido" | "alarme";

export interface ArtigoPalete {
  referencia: string;
  op_numero?: string | null;
  quantidade?: number | null;
  cliente?: string | null;
}

export interface PaleteDetalhe {
  posicao: number;
  conteudo: string;
  op_numero?: string | null;
  quantidade?: number | null;
  cliente?: string | null;
  /** Múltiplos artigos na mesma palete */
  artigos?: ArtigoPalete[] | null;
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
  arejamento_destino: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}
