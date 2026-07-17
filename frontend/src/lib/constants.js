// Categorias de demanda (cores do design operacao-maumau-v3)
export const CATEGORIAS = [
  { value: 'bom-dia', label: 'Bom dia', cor: '#D4943A' },
  { value: 'aquecimento', label: 'Aquecimento', cor: '#CF5C5C' },
  { value: 'pedido', label: 'Pedido', cor: '#7B68EE' },
  { value: 'entrada', label: 'Entrada', cor: '#43A577' },
  { value: 'feedback-entrada', label: 'Feedback entrada', cor: '#4A8FD4' },
  { value: 'feedback-lara', label: 'Feedback lara', cor: '#C45FA0' },
  { value: 'feedback-saque', label: 'Feedback saque', cor: '#3AAFA9' },
  { value: 'outros', label: 'Outros', cor: '#7A7A86' },
];

export const CATEGORIA_COR = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.cor]));
export const CATEGORIA_LABEL = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]));

// Campanhas conhecidas + release IDs (da conversa da operação)
export const CAMPANHAS = [
  { nome: 'AQUECIMENTO', releaseId: 'IRy3PxVIfh85kQrus2LN' },
  { nome: 'ATIVOS 1', releaseId: 'LS061jlmh7U9iJ6v4SUN' },
  { nome: 'ATIVOS 2', releaseId: '8C9Xo8rsvshj6zNYRYYf' },
];

export const VELOCIDADES = [
  { value: 'slow', label: 'Lento' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Rápido' },
  { value: 'none', label: 'Imediato' },
];

// Fluxo de status das demandas
export const STATUS = {
  pendente: { label: 'Pendente', tone: 'slate' },
  em_andamento: { label: 'Em andamento', tone: 'blue' },
  enviado: { label: 'Aguardando aprovação', tone: 'purple' },
  aprovado: { label: 'Aprovado', tone: 'green' },
  texto_agendado: { label: 'Texto agendado', tone: 'amber' },
  agendamento_pendente: { label: 'Agendando', tone: 'amber' },
  agendado: { label: 'Agendado', tone: 'blue' },
  erro_agendamento: { label: 'Erro no agendamento', tone: 'rose' },
  concluido: { label: 'Concluído', tone: 'green' },
  rejeitado: { label: 'Rejeitado', tone: 'rose' },
};

// Colunas do board (kanban) — SÓ o que ainda precisa de atenção. O que já foi
// agendado no SendFlow com mídia ('agendado') e o concluído saem daqui e vão pra
// aba "Concluídas" (senão o board vira 300 cards e confunde). O último estágio
// visível é 'texto_agendado' = tem só o texto agendado, ainda esperando a mídia.
export const BOARD_COLUNAS = [
  { key: 'pendente', titulo: 'Pendente', status: ['pendente'] },
  { key: 'em_andamento', titulo: 'Em produção', status: ['em_andamento', 'rejeitado'] },
  { key: 'enviado', titulo: 'Aprovação', status: ['enviado'] },
  { key: 'aprovado', titulo: 'Aprovado', status: ['aprovado', 'agendamento_pendente', 'erro_agendamento'] },
  { key: 'texto_agendado', titulo: 'Texto agendado', status: ['texto_agendado'] },
];

// Já resolvidos (agendado com mídia no SendFlow + concluído) — ficam na aba
// "Concluídas", fora do board principal.
export const STATUS_CONCLUIDAS = ['agendado', 'concluido'];

// Cores alinhadas ao design v3
export const TONE_CLASSES = {
  slate: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  blue: 'border-brand-400/30 bg-brand-500/10 text-brand-200',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  purple: 'border-[#9B7BDB]/40 bg-[#9B7BDB]/10 text-[#b49ce6]',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};
