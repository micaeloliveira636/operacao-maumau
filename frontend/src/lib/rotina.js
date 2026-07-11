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

// soma minutos a um "HH:MM"
function addMin(hhmm, min) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const t = h * 60 + m + min;
  const H = Math.floor((t % 1440) / 60);
  const M = t % 60;
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
}

// id do texto do ÚLTIMO feedback do bloco (varia por horário/dia).
function feedbackFinalId(entradaHora, sistemaNovo, weekday, ehUltimaDom) {
  if (weekday === 0) return ehUltimaDom ? 'fb-ult-dom-20h20' : 'fb-ult-dom-14h13';
  if (entradaHora === '12:30') return sistemaNovo ? 'fb-ult-sn-14h17' : 'fb-ult-14h15';
  if (entradaHora === '18:30') return sistemaNovo ? 'fb-ult-sn-20h17' : 'fb-ult-20h15';
  if (entradaHora === '21:30') return sistemaNovo ? 'fb-ult-sn-23h21' : 'fb-ult-23h20';
  return 'fb-ult-20h15';
}

// Gera os GRUPOS de feedback do dia — 1 grupo = 1 demanda com vários espaços
// (slots) nomeados, pra Giselle preencher tudo num lugar só.
// Entrada: 5 slots a cada 15min (1º e 5º são TEXTO fixo; 2/3/4 são MÍDIA).
// Lara: 2 slots MÍDIA (+30/+60) após cada pedido de 13h/15h/19h.
function montarFeedbacks(base, weekday) {
  const grupos = [];
  base.entradas.forEach((e, idx) => {
    const ehUltimaDom = weekday === 0 && idx === base.entradas.length - 1;
    const slots = [15, 30, 45, 60, 75].map((off, i) => {
      let legendaId = '';
      let tipo = 'midia';
      if (i === 0) { legendaId = 'fb-primeiro'; tipo = 'texto'; }
      else if (i === 4) { legendaId = feedbackFinalId(e.hora, base.sistemaNovo, weekday, ehUltimaDom); tipo = 'texto'; }
      return { ordem: i, nome: `Feedback ${i + 1}`, horario: addMin(e.hora, off), legendaId, tipo };
    });
    grupos.push({ categoria: 'feedback-entrada', titulo: `Feedbacks entrada ${e.hora}`, slots });
  });
  for (const pd of base.pedidos) {
    if (['13:00', '15:00', '19:00'].includes(pd.hora)) {
      const slots = [30, 60].map((off, i) => ({
        ordem: i, nome: `Feedback lara ${i + 1}`, horario: addMin(pd.hora, off), legendaId: '', tipo: 'midia',
      }));
      grupos.push({ categoria: 'feedback-lara', titulo: `Feedbacks lara ${pd.hora}`, slots });
    }
  }
  return grupos;
}

const NOME_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const nomeDoDia = (dataISO) => NOME_DIA[diaDaSemana(dataISO)];

// Monta o pré-preenchimento. sabadoModo: 2 | 3.
export function montarRotina(dataISO, { sabadoModo = 2 } = {}) {
  const d = diaDaSemana(dataISO);
  const base = d === 6 ? (sabadoModo === 3 ? SAB_3 : SAB_2) : POR_DIA[d];

  const primeiroBomDia = (MODELOS['bom-dia'] || []).find((m) => m.id.startsWith(base.bomDiaPrefixo));

  // slots do dia + acoplamento: pedido 13h => 11h20 e 12h20 (aquecimento);
  // pedido 19h => 18h20 (no lugar do 18h para a campanha AQUECIMENTO).
  const slotsOn = new Set(base.aquec);
  if (base.pedidos.some((pd) => pd.hora === '13:00')) { slotsOn.add('11h20'); slotsOn.add('12h20'); }
  if (base.pedidos.some((pd) => pd.hora === '19:00')) slotsOn.add('18h20');

  const aquec = {};
  for (const p of PASTAS_AQUECIMENTO) {
    const opts = modelosDaPasta(p.id);
    const on = slotsOn.has(p.id) && opts.length > 0;
    aquec[p.id] = { on, modeloId: on && opts[0] ? opts[0].id : '', hora: p.hora };
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
    feedbacks: montarFeedbacks(base, d),
    sistemaNovo: base.sistemaNovo,
  };
}
