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

// PATCH /demandas/:id — editar (admin only)
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, req.params.id))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    // Não permite editar se já agendada ou concluída
    if (['agendado', 'concluido'].includes(demanda.status)) {
      return res.status(400).json({ error: 'Não é possível editar demanda neste status' });
    }

    const allowedFields = [
      'titulo', 'categoria', 'descricao', 'dataAlvo', 'horarios',
      'campanhasDestino', 'releaseIds', 'atribuidoA',
      'legenda', 'mencionar', 'velocidade', 'prioridade',
      'linkPrincipal', 'linkDois', 'slots',
    ];

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

// GET /demandas/:id/agendar/preview — mostra o plano (regras aplicadas) sem enviar
router.get('/:id/agendar/preview', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { demanda, arquivos: files, erro, msg } = await carregarParaAgendar(req.params.id);
    if (erro) return res.status(erro).json({ error: msg });
    const plano = agendador.montarPlano(demanda, files);
    const autoGerida = agendador.ehAutoGerida(demanda);
    const statusOk = demanda.status === 'aprovado' || (autoGerida && demanda.status === 'em_andamento');
    return res.json({
      status: demanda.status,
      podeAgendar: statusOk && plano.itens.length > 0,
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

    const autoGerida = agendador.ehAutoGerida(demanda);
    const statusOk = ['aprovado', 'agendamento_pendente', 'erro_agendamento', 'texto_agendado'].includes(demanda.status)
      || (autoGerida && demanda.status === 'em_andamento');
    if (!statusOk) {
      return res.status(400).json({ error: 'Demanda precisa estar aprovada para agendar' });
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

    return res.status(resultado.ok ? 200 : 400).json({ demanda: updated, resultado });
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

    return res.status(resultado.ok ? 200 : 400).json({ demanda: updated, resultado });
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

    if (actionIds.length === 0) {
      return res.status(400).json({ error: 'Nenhuma ação agendada para cancelar' });
    }

    const del = await sendflow.deletarAcoes(actionIds);
    if (!del.ok) {
      return res.status(400).json({ error: `SendFlow: ${del.error}` });
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

    if (['agendado', 'concluido'].includes(demanda.status)) {
      return res.status(400).json({ error: 'Não é possível deletar demanda agendada ou concluída' });
    }

    await db.delete(demandas).where(eq(demandas.id, req.params.id));

    await logActivity({
      userId: req.user.id,
      action: 'demanda.deletada',
      metadata: { titulo: demanda.titulo },
      ipAddress: req.ip,
    });

    return res.json({ message: 'Demanda deletada' });
  } catch (err) {
    console.error('Erro ao deletar demanda:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
