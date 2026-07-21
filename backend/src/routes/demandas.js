const express = require('express');
const { eq, desc, and } = require('drizzle-orm');
const { db } = require('../db');
const { demandas, arquivos, sendflowSchedules } = require('../db/schema');
const sendflow = require('../utils/sendflow');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { notificarUsuario, notificarAdmins } = require('../utils/notify');
const agendador = require('../services/agendador');

const router = express.Router();

// Status válidos e transições permitidas
const TRANSICOES = {
  pendente: ['em_andamento'],
  em_andamento: ['enviado'],
  enviado: ['aprovado', 'rejeitado'],
  rejeitado: ['em_andamento'],
  aprovado: ['agendamento_pendente'],
  agendamento_pendente: ['agendado', 'erro_agendamento'],
  erro_agendamento: ['agendamento_pendente'],
  agendado: ['concluido'],
};

// GET /demandas — lista
router.get('/', requireAuth, async (req, res) => {
  try {
    let query = db.select().from(demandas).orderBy(desc(demandas.createdAt));

    // Operador só vê as suas
    if (req.user.role === 'operador') {
      query = db
        .select()
        .from(demandas)
        .where(eq(demandas.atribuidoA, req.user.id))
        .orderBy(desc(demandas.createdAt));
    }

    const result = await query;
    return res.json({ demandas: result });
  } catch (err) {
    console.error('Erro ao listar demandas:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /demandas/:id — detalhe
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, req.params.id))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    // Operador só acessa as suas
    if (req.user.role === 'operador' && demanda.atribuidoA !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Busca arquivos da demanda
    const files = await db
      .select()
      .from(arquivos)
      .where(eq(arquivos.demandaId, demanda.id))
      .orderBy(arquivos.ordem);

    return res.json({ demanda, arquivos: files });
  } catch (err) {
    console.error('Erro ao buscar demanda:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /demandas — criar (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      titulo, categoria, descricao, dataAlvo, horarios,
      campanhasDestino, releaseIds, atribuidoA,
      legenda, mencionar, velocidade, prioridade,
      linkPrincipal, linkDois,
    } = req.body;

    if (!titulo || !categoria || !dataAlvo || !horarios || !atribuidoA) {
      return res.status(400).json({ error: 'Campos obrigatórios: titulo, categoria, dataAlvo, horarios, atribuidoA' });
    }

    // Auto-gerida (admin criou pra si): já entra em produção, sem aprovação.
    const autoGerida = atribuidoA === req.user.id;

    const [novaDemanda] = await db.insert(demandas).values({
      titulo,
      categoria,
      descricao: descricao || null,
      dataAlvo,
      horarios,
      campanhasDestino: campanhasDestino || [],
      releaseIds: releaseIds || [],
      atribuidoA,
      criadoPor: req.user.id,
      status: 'em_andamento',
      legenda: legenda || null,
      mencionar: mencionar || false,
      velocidade: velocidade || 'slow',
      prioridade: prioridade || 'normal',
      linkPrincipal: linkPrincipal || null,
      linkDois: linkDois || null,
    }).returning();

    await logActivity({
      demandaId: novaDemanda.id,
      userId: req.user.id,
      action: 'demanda.criada',
      metadata: { titulo, categoria },
      ipAddress: req.ip,
    });

    // Notifica o operador atribuído (não notifica o admin quando cria pra si).
    if (atribuidoA && !autoGerida) {
      notificarUsuario({
        userId: atribuidoA,
        titulo: 'Nova demanda atribuída',
        mensagem: `${titulo} — categoria ${categoria}. Prazo: ${dataAlvo}.`,
        tipo: 'info',
        demandaId: novaDemanda.id,
        url: `/demandas/${novaDemanda.id}`,
      });
    }

    return res.status(201).json({ demanda: novaDemanda });
  } catch (err) {
    console.error('Erro ao criar demanda:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /demandas/rotina — cria várias demandas de uma vez ("montar o dia")
router.post('/rotina', requireAuth, requireAdmin, async (req, res) => {
  try {
    const lista = Array.isArray(req.body?.demandas) ? req.body.demandas : [];
    if (lista.length === 0) return res.status(400).json({ error: 'Nenhuma demanda enviada' });
    if (lista.length > 40) return res.status(400).json({ error: 'Máximo de 40 demandas por vez' });

    const criadas = [];
    for (const d of lista) {
      if (!d?.titulo || !d?.categoria || !d?.dataAlvo || !Array.isArray(d?.horarios) || !d?.atribuidoA) {
        return res.status(400).json({ error: `Demanda inválida: ${d?.titulo || '(sem título)'}` });
      }
      const autoGerida = d.atribuidoA === req.user.id;
      const [nova] = await db.insert(demandas).values({
        titulo: d.titulo,
        categoria: d.categoria,
        descricao: d.descricao || null,
        dataAlvo: d.dataAlvo,
        horarios: d.horarios,
        campanhasDestino: d.campanhasDestino || [],
        releaseIds: d.releaseIds || [],
        atribuidoA: d.atribuidoA,
        criadoPor: req.user.id,
        status: 'em_andamento',
        legenda: d.legenda || null,
        mencionar: d.mencionar || false,
        velocidade: d.velocidade || 'slow',
        linkPrincipal: d.linkPrincipal || null,
        linkDois: d.linkDois || null,
        gruposAquecimento: Array.isArray(d.gruposAquecimento) && d.gruposAquecimento.length ? d.gruposAquecimento : null,
        slot: d.slot || null,
        entradaHora: d.entradaHora || null,
        slots: Array.isArray(d.slots) ? d.slots : null,
      }).returning();
      criadas.push(nova);

      if (d.atribuidoA && !autoGerida) {
        notificarUsuario({
          userId: d.atribuidoA,
          titulo: 'Nova demanda atribuída',
          mensagem: `${d.titulo} — categoria ${d.categoria}. Prazo: ${d.dataAlvo}.`,
          tipo: 'info',
          demandaId: nova.id,
          url: `/demandas/${nova.id}`,
        });
      }
    }

    // Agenda JÁ o TEXTO das demandas auto-geridas com texto (aquecimento /
    // entrada / pedido) — caem em "Agendado". Feedbacks seguem o fluxo da
    // operadora (mídia -> aprovação -> agendamento).
    let textosAgendados = 0;
    const errosTexto = [];
    if (req.body?.agendarTextos !== false) {
      for (const nova of criadas) {
        const auto = nova.atribuidoA === req.user.id;
        const ehFeedback = String(nova.categoria || '').startsWith('feedback');
        if (!auto || ehFeedback || !nova.legenda) continue;
        try {
          const r = await agendador.executarAgendamentoTexto(nova, req.user.id);
          if (r.ok) {
            textosAgendados += 1;
            await db.update(demandas).set({ status: 'texto_agendado', updatedAt: new Date() }).where(eq(demandas.id, nova.id));
          } else {
            errosTexto.push(`${nova.titulo}: ${(r.erros || [r.error]).slice(0, 1).join('')}`);
          }
          // API key bloqueada OU rate limit: para de tentar as demais
          // (insistir só prolonga o bloqueio / acumula violações).
          if (r.bloqueado || r.rateLimited) break;
          // Suaviza a rajada de chamadas ao SendFlow (evita estourar o rate limit).
          await new Promise((res) => setTimeout(res, 350));
        } catch (e) {
          errosTexto.push(`${nova.titulo}: ${e.message}`);
        }
      }
    }

    await logActivity({
      userId: req.user.id,
      action: 'rotina.criada',
      metadata: { total: criadas.length, textosAgendados, erros: errosTexto.length },
      ipAddress: req.ip,
    });

    return res.status(201).json({ demandas: criadas, textosAgendados, errosTexto });
  } catch (err) {
    console.error('Erro ao montar o dia:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /demandas/reconferir-chips — dispara a reconferência manualmente (admin).
// Janela ampla por padrão (12h = resto do dia): é o botão pra usar logo depois
// de ADICIONAR UM GRUPO na campanha — reconstrói os envios que ainda vão sair
// com a lista de grupos atualizada, sem esperar o cron.
router.post('/reconferir-chips', requireAuth, requireAdmin, async (req, res) => {
  try {
    const janelaMin = Number(req.body?.janelaMin) || 720;
    // forcar: reconstrói os envios segmentados com a lista da REGRA, sem depender
    // de comparação nenhuma. É a garantia de que nenhum grupo válido fica de fora.
    const forcar = req.body?.forcar !== false;
    const r = await agendador.reconferirChips({ janelaMin, forcar });
    const fim = await agendador.finalizarEnviadas().catch(() => ({ concluidas: 0 }));
    return res.json({ ...r, ...fim });
  } catch (err) {
    console.error('Erro ao reconferir chips:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /demandas/:id — editar (admin: tudo; operador dono: só os slots/legendas)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, req.params.id))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    // Admin edita tudo; operador só a demanda dele (feedbacks) e só os slots.
    const ehAdmin = req.user.role === 'admin';
    const ehDono = demanda.atribuidoA === req.user.id;
    if (!ehAdmin && !ehDono) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Não permite editar se já agendada ou concluída
    if (['agendado', 'concluido'].includes(demanda.status)) {
      return res.status(400).json({ error: 'Não é possível editar demanda neste status' });
    }

    const allowedFields = ehAdmin
      ? [
          'titulo', 'categoria', 'descricao', 'dataAlvo', 'horarios',
          'campanhasDestino', 'releaseIds', 'atribuidoA',
          'legenda', 'mencionar', 'velocidade', 'prioridade',
          'linkPrincipal', 'linkDois', 'gruposAquecimento', 'slots',
        ]
      : ['slots']; // operador só mexe nas legendas dos espaços de feedback

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(demandas)
      .set(updates)
      .where(eq(demandas.id, req.params.id))
      .returning();

    await logActivity({
      demandaId: updated.id,
      userId: req.user.id,
      action: 'demanda.editada',
      metadata: { campos: Object.keys(updates) },
      ipAddress: req.ip,
    });

    return res.json({ demanda: updated });
  } catch (err) {
    console.error('Erro ao editar demanda:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PATCH /demandas/:id/slot — troca o SLOT de uma entrada EM CASCATA:
 *  1. título da entrada        ("Entrada 21:30 — FORTUNE DRAGON 🐉")
 *  2. texto/legenda da entrada (troca o nome do slot antigo pelo novo)
 *  3. título do feedback ligado ("Feedback 21h30 - FORTUNE DRAGON 🐉")
 *  4. se o texto já estava agendado, apaga no SendFlow e reagenda com o novo
 * Serve pra quando o slot muda em cima da hora (ex.: trocar às 13h).
 */
router.patch('/:id/slot', requireAuth, requireAdmin, async (req, res) => {
  try {
    const novoSlot = String(req.body?.slot || '').trim();
    if (!novoSlot) return res.status(400).json({ error: 'slot obrigatório' });

    const [demanda] = await db.select().from(demandas).where(eq(demandas.id, req.params.id)).limit(1);
    if (!demanda) return res.status(404).json({ error: 'Demanda não encontrada' });
    if (demanda.categoria !== 'entrada') {
      return res.status(400).json({ error: 'Trocar slot só vale para demanda de entrada' });
    }
    if (['agendado', 'concluido'].includes(demanda.status)) {
      return res.status(400).json({ error: 'Demanda já agendada com mídia — cancele o agendamento antes de trocar o slot' });
    }

    // Demandas criadas antes do campo `slot` existir: deduz o slot antigo pelo
    // título ("Entrada 21:30 — FORTUNE SNAKE 🐍"), assim a troca funciona nelas.
    const slotAntigo = demanda.slot || (String(demanda.titulo || '').match(/—\s*(.+)$/)?.[1] || '').trim();
    const hora = (demanda.horarios || [])[0] || '';

    // texto: troca todas as ocorrências do slot antigo pelo novo (o slot entra
    // literal na legenda via {slot}). Sem slot antigo, mantém o texto.
    let novaLegenda = demanda.legenda || '';
    if (slotAntigo && novaLegenda.includes(slotAntigo)) {
      novaLegenda = novaLegenda.split(slotAntigo).join(novoSlot);
    }
    // Separador é SEMPRE "·" — nunca travessão (regra do Micael).
    const novoTitulo = `Entrada ${hora}${novoSlot ? ` · ${novoSlot}` : ''}`;

    // Se o texto já estava agendado, remove os provisórios antes de reagendar.
    const tinhaTexto = demanda.status === 'texto_agendado';
    if (tinhaTexto) await agendador.apagarProvisorios(demanda.id).catch(() => {});

    const [atualizada] = await db.update(demandas)
      .set({ slot: novoSlot, titulo: novoTitulo, legenda: novaLegenda, updatedAt: new Date() })
      .where(eq(demandas.id, demanda.id))
      .returning();

    // Feedback ligado a essa entrada (mesma data + hora da entrada).
    let feedbackAtualizado = null;
    if (hora) {
      const candidatos = await db.select().from(demandas).where(and(
        eq(demandas.dataAlvo, demanda.dataAlvo),
        eq(demandas.categoria, 'feedback-entrada')
      ));
      // liga por entradaHora; nas antigas (sem o campo) cai pro título.
      const horaH = String(hora).replace(':', 'h');
      const fb = candidatos.find((c) => c.entradaHora === hora)
        || candidatos.find((c) => String(c.titulo || '').includes(horaH) || String(c.titulo || '').includes(hora));
      if (fb && !['agendado', 'concluido'].includes(fb.status)) {
        const tituloFb = `Feedback ${String(hora).replace(':', 'h')} · ${novoSlot}`;
        [feedbackAtualizado] = await db.update(demandas)
          .set({ slot: novoSlot, titulo: tituloFb, updatedAt: new Date() })
          .where(eq(demandas.id, fb.id))
          .returning();
      }
    }

    // Reagenda o texto com a legenda nova.
    let reagendado = null;
    if (tinhaTexto) {
      const r = await agendador.executarAgendamentoTexto(atualizada, req.user.id);
      reagendado = { ok: r.ok, agendadas: r.agendadas || 0, erros: r.erros || [] };
      if (!r.ok) {
        await db.update(demandas).set({ status: 'erro_agendamento', updatedAt: new Date() }).where(eq(demandas.id, demanda.id));
      }
    }

    await logActivity({
      demandaId: demanda.id, userId: req.user.id, action: 'demanda.slot.trocado',
      metadata: { de: slotAntigo, para: novoSlot, reagendado: !!tinhaTexto },
      ipAddress: req.ip,
    });

    return res.json({ demanda: atualizada, feedback: feedbackAtualizado, reagendado });
  } catch (err) {
    console.error('Erro ao trocar slot:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /demandas/:id/status — mudar status
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { novoStatus, motivoRejeicao } = req.body;

    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, req.params.id))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    // Operador só acessa as suas
    if (req.user.role === 'operador' && demanda.atribuidoA !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Valida transição
    const transicoesPermitidas = TRANSICOES[demanda.status] || [];
    if (!transicoesPermitidas.includes(novoStatus)) {
      return res.status(400).json({
        error: `Transição inválida: ${demanda.status} → ${novoStatus}`,
        permitidas: transicoesPermitidas,
      });
    }

    // Ações que requerem admin
    const acoesAdmin = ['aprovado', 'rejeitado', 'agendamento_pendente', 'agendado', 'concluido'];
    if (acoesAdmin.includes(novoStatus) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas admin pode realizar esta ação' });
    }

    // Rejeição requer motivo
    if (novoStatus === 'rejeitado' && !motivoRejeicao) {
      return res.status(400).json({ error: 'Motivo de rejeição é obrigatório' });
    }

    // Enviar pra aprovação: valida se tem mídias suficientes.
    if (novoStatus === 'enviado') {
      const files = await db
        .select()
        .from(arquivos)
        .where(eq(arquivos.demandaId, demanda.id));

      // Com slots, só os espaços de MÍDIA precisam de arquivo (os de texto não).
      const necessarias = Array.isArray(demanda.slots) && demanda.slots.length
        ? demanda.slots.filter((s) => s.tipo !== 'texto').length
        : (demanda.horarios || []).length;

      if (files.length < necessarias) {
        return res.status(400).json({
          error: `Faltam mídias: ${files.length}/${necessarias}`,
        });
      }
    }

    const updates = {
      status: novoStatus,
      updatedAt: new Date(),
    };

    if (novoStatus === 'rejeitado') {
      updates.motivoRejeicao = motivoRejeicao;
    }

    const [updated] = await db
      .update(demandas)
      .set(updates)
      .where(eq(demandas.id, req.params.id))
      .returning();

    await logActivity({
      demandaId: updated.id,
      userId: req.user.id,
      action: `demanda.${novoStatus}`,
      metadata: { de: demanda.status, para: novoStatus, motivo: motivoRejeicao },
      ipAddress: req.ip,
    });

    // Notificações por transição.
    if (novoStatus === 'enviado') {
      notificarAdmins({
        titulo: 'Demanda enviada para aprovação',
        mensagem: `${demanda.titulo} está pronta para revisão.`,
        tipo: 'alerta',
        demandaId: demanda.id,
        url: `/demandas/${demanda.id}`,
      });
    } else if (novoStatus === 'aprovado' && demanda.atribuidoA) {
      notificarUsuario({
        userId: demanda.atribuidoA,
        titulo: 'Demanda aprovada',
        mensagem: `${demanda.titulo} foi aprovada.`,
        tipo: 'sucesso',
        demandaId: demanda.id,
        url: `/demandas/${demanda.id}`,
      });
    } else if (novoStatus === 'rejeitado' && demanda.atribuidoA) {
      notificarUsuario({
        userId: demanda.atribuidoA,
        titulo: 'Demanda rejeitada',
        mensagem: `${demanda.titulo} foi rejeitada. Motivo: ${motivoRejeicao}`,
        tipo: 'erro',
        demandaId: demanda.id,
        url: `/demandas/${demanda.id}`,
      });
    }

    return res.json({ demanda: updated });
  } catch (err) {
    console.error('Erro ao mudar status:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Helper: carrega demanda + arquivos (admin, aprovada)
async function carregarParaAgendar(id) {
  const [demanda] = await db.select().from(demandas).where(eq(demandas.id, id)).limit(1);
  if (!demanda) return { erro: 404, msg: 'Demanda não encontrada' };
  const files = await db
    .select()
    .from(arquivos)
    .where(eq(arquivos.demandaId, demanda.id))
    .orderBy(arquivos.ordem);
  return { demanda, arquivos: files };
}

/**
 * Pode agendar nesta demanda? REGRA ÚNICA — usada pelo preview (que libera o
 * botão) e pelo POST /agendar (que executa). Antes elas eram diferentes: o
 * preview não aceitava 'agendamento_pendente'/'erro_agendamento', então uma
 * demanda travada em "Agendando" deixava o botão "Disparar" DESABILITADO e não
 * havia como reenviar pelo painel.
 */
function podeAgendarDemanda(demanda) {
  const autoGerida = agendador.ehAutoGerida(demanda);
  const temSlots = Array.isArray(demanda.slots) && demanda.slots.length > 0;
  return ['aprovado', 'agendamento_pendente', 'erro_agendamento', 'texto_agendado'].includes(demanda.status)
    || ((autoGerida || temSlots) && demanda.status === 'em_andamento');
}

// Motivo legível quando o agendamento falha. Sem isso a rota devolvia 400 com
// só `{demanda, resultado}` (sem `.error`) e a tela mostrava "Erro 400" pelado,
// escondendo a causa real (rate limit, chave bloqueada, campanha sem chips…).
function motivoFalhaAgendamento(resultado = {}) {
  if (resultado.error) return resultado.error;
  const erros = Array.isArray(resultado.erros) ? resultado.erros.filter(Boolean) : [];
  if (erros.length) return erros.slice(0, 2).join(' | ');
  const avisos = Array.isArray(resultado.avisos) ? resultado.avisos.filter(Boolean) : [];
  if (avisos.length) return avisos.slice(0, 2).join(' | ');
  return 'Nada foi agendado. Verifique se a campanha tem chips e tente de novo.';
}

// GET /demandas/:id/agendar/preview — mostra o plano (regras aplicadas) sem enviar
router.get('/:id/agendar/preview', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { demanda, arquivos: files, erro, msg } = await carregarParaAgendar(req.params.id);
    if (erro) return res.status(erro).json({ error: msg });
    const plano = agendador.montarPlano(demanda, files);
    // Remove do plano os envios cujo horário já passou (não serão agendados).
    const futuros = plano.itens.filter((i) => !agendador.jaPassou(i.scheduledTo));
    const passados = plano.itens.length - futuros.length;
    if (passados) {
      plano.avisos = [...plano.avisos, `${passados} envio(s) com horário já passado — não serão agendados.`];
      plano.itens = futuros;
    }
    return res.json({
      status: demanda.status,
      podeAgendar: podeAgendarDemanda(demanda) && futuros.length > 0,
      ...plano,
    });
  } catch (err) {
    console.error('Erro no preview de agendamento:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /demandas/:id/agendar — executa o agendamento direto no SendFlow
router.post('/:id/agendar', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { demanda, arquivos: files, erro, msg } = await carregarParaAgendar(req.params.id);
    if (erro) return res.status(erro).json({ error: msg });

    if (!podeAgendarDemanda(demanda)) {
      return res.status(400).json({ error: 'Demanda precisa estar aprovada para agendar' });
    }

    // RECUPERAÇÃO AUTOMÁTICA: se a tentativa anterior deu erro ou ficou travada
    // em "Agendando", limpa o que sobrou (SendFlow + banco) e refaz do zero.
    // Sem isso a idempotência pulava tudo e era impossível reenviar — o admin
    // ficava obrigado a agendar na mão no SendFlow.
    const precisaLimpar = ['erro_agendamento', 'agendamento_pendente'].includes(demanda.status);
    let limpeza = null;
    if (req.body?.forcar || precisaLimpar) {
      limpeza = await agendador.limparAgendamentos(demanda.id).catch(() => null);
    }

    // marca como em processamento
    await db
      .update(demandas)
      .set({ status: 'agendamento_pendente', updatedAt: new Date() })
      .where(eq(demandas.id, demanda.id));

    const resultado = await agendador.executarAgendamento(
      { ...demanda, status: 'agendamento_pendente' },
      files,
      req.user.id
    );

    const novoStatus = resultado.ok ? 'agendado' : 'erro_agendamento';
    const [updated] = await db
      .update(demandas)
      .set({ status: novoStatus, updatedAt: new Date() })
      .where(eq(demandas.id, demanda.id))
      .returning();

    await logActivity({
      demandaId: demanda.id,
      userId: req.user.id,
      action: resultado.ok ? 'agendamento.executado' : 'agendamento.erro',
      metadata: {
        agendadas: resultado.agendadas,
        puladas: resultado.puladas,
        erros: resultado.erros,
        limpeza,
      },
      ipAddress: req.ip,
    });

    if (resultado.ok) {
      notificarAdmins({
        titulo: 'Demanda agendada',
        mensagem: `${demanda.titulo}: ${resultado.agendadas} mensagem(ns) agendada(s) no SendFlow.`,
        tipo: 'sucesso',
        demandaId: demanda.id,
        url: `/demandas/${demanda.id}`,
      });
    }

    return res.status(resultado.ok ? 200 : 400).json({
      demanda: updated,
      resultado,
      ...(resultado.ok ? {} : { error: motivoFalhaAgendamento(resultado) }),
    });
  } catch (err) {
    console.error('Erro ao agendar:', err);
    await db
      .update(demandas)
      .set({ status: 'erro_agendamento', updatedAt: new Date() })
      .where(eq(demandas.id, req.params.id))
      .catch(() => {});
    return res.status(500).json({ error: 'Erro interno ao agendar' });
  }
});

// POST /demandas/:id/agendar-texto — agenda só o texto (provisório), pra travar
// o horário antes da mídia. Depois, "agendar" com mídia troca automaticamente.
router.post('/:id/agendar-texto', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [demanda] = await db.select().from(demandas).where(eq(demandas.id, req.params.id)).limit(1);
    if (!demanda) return res.status(404).json({ error: 'Demanda não encontrada' });

    if (!demanda.legenda || !String(demanda.legenda).trim()) {
      return res.status(400).json({ error: 'Demanda sem texto para agendar' });
    }
    if (['agendado', 'concluido', 'agendamento_pendente'].includes(demanda.status)) {
      return res.status(400).json({ error: 'Demanda não está em estado para agendar texto' });
    }

    // remove provisórios antigos e recria
    await agendador.apagarProvisorios(demanda.id);
    const resultado = await agendador.executarAgendamentoTexto(demanda, req.user.id);

    const [updated] = await db
      .update(demandas)
      .set({ status: resultado.ok ? 'texto_agendado' : demanda.status, updatedAt: new Date() })
      .where(eq(demandas.id, demanda.id))
      .returning();

    await logActivity({
      demandaId: demanda.id,
      userId: req.user.id,
      action: resultado.ok ? 'agendamento.texto' : 'agendamento.texto.erro',
      metadata: { agendadas: resultado.agendadas, erros: resultado.erros },
      ipAddress: req.ip,
    });

    return res.status(resultado.ok ? 200 : 400).json({
      demanda: updated,
      resultado,
      ...(resultado.ok ? {} : { error: motivoFalhaAgendamento(resultado) }),
    });
  } catch (err) {
    console.error('Erro ao agendar texto:', err);
    return res.status(500).json({ error: 'Erro interno ao agendar texto' });
  }
});

// POST /demandas/:id/cancelar-agendamento — apaga as ações no SendFlow e volta pra aprovado
router.post('/:id/cancelar-agendamento', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [demanda] = await db.select().from(demandas).where(eq(demandas.id, req.params.id)).limit(1);
    if (!demanda) return res.status(404).json({ error: 'Demanda não encontrada' });

    const schedules = await db
      .select()
      .from(sendflowSchedules)
      .where(eq(sendflowSchedules.demandaId, demanda.id));

    const ativos = schedules.filter((s) => s.status !== 'cancelado');
    // Reúne todos os actionIds (um por conta) de cada schedule
    const actionIds = [];
    for (const s of ativos) {
      const doResult = Array.isArray(s.resultJson?.actionIds) ? s.resultJson.actionIds : [];
      for (const a of doResult) if (a) actionIds.push(a);
      if (!doResult.length && s.sendflowActionId) actionIds.push(s.sendflowActionId);
    }

    // NÃO trava quando não há actionId (linha órfã de um agendamento que falhou):
    // o cancelamento precisa SEMPRE liberar a demanda pra reagendar, senão fica
    // presa pra sempre e só resta agendar na mão no SendFlow.
    if (actionIds.length) {
      const del = await sendflow.deletarAcoes(actionIds);
      // falha ao apagar no SendFlow também não pode travar — segue e libera aqui
      if (!del.ok) console.error('Cancelar: falha ao apagar no SendFlow (seguindo):', del.error);
    }

    // marca schedules como cancelados e volta a demanda para aprovado
    for (const s of ativos) {
      await db
        .update(sendflowSchedules)
        .set({ status: 'cancelado' })
        .where(eq(sendflowSchedules.id, s.id));
    }
    // Auto-gerida volta pra produção (reabre uploader); com operador, pra aprovado.
    const voltarPara = agendador.ehAutoGerida(demanda) ? 'em_andamento' : 'aprovado';
    const [updated] = await db
      .update(demandas)
      .set({ status: voltarPara, updatedAt: new Date() })
      .where(eq(demandas.id, demanda.id))
      .returning();

    await logActivity({
      demandaId: demanda.id,
      userId: req.user.id,
      action: 'agendamento.cancelado',
      metadata: { acoesDeletadas: actionIds.length },
      ipAddress: req.ip,
    });

    return res.json({ demanda: updated, deletadas: actionIds.length });
  } catch (err) {
    console.error('Erro ao cancelar agendamento:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /demandas/:id/agendamento-payload — payload para Claude (legado/backup)
router.get('/:id/agendamento-payload', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, req.params.id))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    if (demanda.status !== 'aprovado') {
      return res.status(400).json({ error: 'Demanda precisa estar aprovada para agendar' });
    }

    // Busca apenas arquivos aprovados
    const files = await db
      .select()
      .from(arquivos)
      .where(and(
        eq(arquivos.demandaId, demanda.id),
        eq(arquivos.status, 'aprovado')
      ))
      .orderBy(arquivos.ordem);

    if (files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo aprovado nesta demanda' });
    }

    // Monta payload
    const campanhas = demanda.campanhasDestino.map((nome, i) => ({
      nome,
      releaseId: demanda.releaseIds[i] || null,
    }));

    const payload = {
      demandaId: demanda.id,
      titulo: demanda.titulo,
      categoria: demanda.categoria,
      dataAlvo: demanda.dataAlvo,
      campanhas,
      mencionar: demanda.mencionar,
      velocidade: demanda.velocidade,
      arquivos: files.map(f => ({
        id: f.id,
        ordem: f.ordem,
        horario: f.horario,
        tipo: f.tipo,
        url: f.cloudinaryUrl,
        legenda: f.legendaCustom || demanda.legenda,
      })),
    };

    return res.json(payload);
  } catch (err) {
    console.error('Erro ao gerar payload:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /demandas/:id — deletar (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, req.params.id))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    // Limpa os envios no SendFlow antes de apagar (evita ações órfãs).
    let acoesRemovidas = 0;
    try {
      acoesRemovidas = await agendador.apagarAcoesDaDemanda(demanda.id);
    } catch (e) {
      console.error('Falha ao limpar ações da demanda no SendFlow:', e.message);
    }

    await db.delete(demandas).where(eq(demandas.id, req.params.id));

    await logActivity({
      userId: req.user.id,
      action: 'demanda.deletada',
      metadata: { titulo: demanda.titulo, status: demanda.status, acoesRemovidas },
      ipAddress: req.ip,
    });

    return res.json({ message: 'Demanda deletada', acoesRemovidas });
  } catch (err) {
    console.error('Erro ao deletar demanda:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
