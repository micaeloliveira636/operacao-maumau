// Roteiro padrão por dia da semana (fonte: manual MCP + scripts diários).
// Gera um pré-preenchimento editável do "Montar o dia".
import { MODELOS, PASTAS_AQUECIMENTO, modelosDaPasta } from './modelos';

// campanhas por alvo do pedido
const CAMPS = {
  todos: ['AQUECIMENTO', 'ATIVOS 1', 'ATIVOS 2'],
  ativos: ['ATIVOS 1', 'ATIVOS 2'],
  aquec: ['AQUECIMENTO'],
};

// weekday (0=Dom … 6=Sáb) -> estrutura do dia
// aquec: ids das pastas ligadas · pedidos: {hora, alvo, modeloId} · entradas: {hora}
const DOM = {
  bomDiaHora: '11:00', bomDiaPrefixo: 'bd-dom',
  aquec: ['12h', '18h'],
  pedidos: [{ hora: '15:00', alvo: 'todos', modeloId: 'ped-15h' }],
  entradas: [{ hora: '12:30' }, { hora: '18:30' }],
  sistemaNovo: false,
};
const SEG = {
  bomDiaHora: '10:00', bomDiaPrefixo: 'bd-seg',
  aquec: ['11h20', '18h', '21h'],
  pedidos: [
    { hora: '13:00', alvo: 'todos', modeloId: 'ped-13h' },
    { hora: '15:00', alvo: 'todos', modeloId: 'ped-15h' },
    { hora: '19:00', alvo: 'aquec', modeloId: 'ped-19h' },
  ],
  entradas: [{ hora: '18:30' }, { hora: '21:30' }],
  sistemaNovo: true, // segunda usa copys "sistema novo"
};
const MEIO = (prefixo) => ({
  bomDiaHora: '10:00', bomDiaPrefixo: prefixo,
  aquec: ['11h20', '12h', '18h', '21h'],
  pedidos: [
    { hora: '13:00', alvo: 'aquec', modeloId: 'ped-13h' },
    { hora: '15:00', alvo: 'todos', modeloId: 'ped-15h' }, // regra fixa: 15h -> TODOS
    { hora: '19:00', alvo: 'aquec', modeloId: 'ped-19h' },
  ],
  entradas: [{ hora: '12:30' }, { hora: '18:30' }, { hora: '21:30' }],
  sistemaNovo: false,
});
const QUI = {
  ...MEIO('bd-qui'),
  pedidos: [{ hora: '15:00', alvo: 'todos', modeloId: 'ped-15h' }], // sem 13h/19h
  sistemaNovo: true,
};
const SAB_2 = {
  bomDiaHora: '10:00', bomDiaPrefixo: 'bd-sab',
  aquec: ['11h20', '12h', '18h', '21h'],
  pedidos: [
    { hora: '13:00', alvo: 'aquec', modeloId: 'ped-13h' },
    { hora: '15:00', alvo: 'todos', modeloId: 'ped-15h' }, // regra fixa: 15h -> TODOS
  ],
  entradas: [{ hora: '18:30' }, { hora: '21:30' }],
  sistemaNovo: false,
};
const SAB_3 = { ...MEIO('bd-sab'), pedidos: SAB_2.pedidos };

const POR_DIA = { 0: DOM, 1: SEG, 2: MEIO('bd-ter'), 3: MEIO('bd-qua'), 4: QUI, 5: MEIO('bd-sex'), 6: SAB_2 };

export function diaDaSemana(dataISO) {
  // meio-dia local pra não escorregar de dia por fuso
  return new Date(`${dataISO}T12:00:00`).getDay();
}

const NOME_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const nomeDoDia = (dataISO) => NOME_DIA[diaDaSemana(dataISO)];

// Monta o pré-preenchimento. sabadoModo: 2 | 3.
export function montarRotina(dataISO, { sabadoModo = 2 } = {}) {
  const d = diaDaSemana(dataISO);
  const base = d === 6 ? (sabadoModo === 3 ? SAB_3 : SAB_2) : POR_DIA[d];

  const primeiroBomDia = (MODELOS['bom-dia'] || []).find((m) => m.id.startsWith(base.bomDiaPrefixo));

  const aquec = {};
  for (const p of PASTAS_AQUECIMENTO) {
    const on = base.aquec.includes(p.id);
    const opts = modelosDaPasta(p.id);
    aquec[p.id] = { on: on && opts.length > 0, modeloId: on && opts[0] ? opts[0].id : '', hora: p.hora };
  }

  const pedidos = base.pedidos.map((pd) => ({
    hora: pd.hora,
    campanhas: CAMPS[pd.alvo],
    modeloId: pd.modeloId,
  }));

  const entradas = base.entradas.map((e) => ({ hora: e.hora, slot: '', modeloId: '' }));

  return {
    bomDia: { on: true, hora: base.bomDiaHora, modeloId: primeiroBomDia?.id || '' },
    aquec,
    pedidos,
    entradas,
    sistemaNovo: base.sistemaNovo,
  };
}
