const { and, eq, gte, lte, isNull } = require('drizzle-orm');
const { db } = require('../db');
const { sendflowSchedules, automationJobs } = require('../db/schema');
const sendflow = require('../utils/sendflow');

// Nome canônico das campanhas (o que casa com a regra de AQUECIMENTO).
const AQUECIMENTO = 'AQUECIMENTO';
const ATIVOS1 = 'ATIVOS 1';

function norm(s) {
  return String(s || '').trim().toUpperCase();
}

// Demanda "auto-gerida": o admin criou para si mesmo. Nesse caso não há
// fluxo de aprovação — as mídias já contam como prontas para agendar.
function ehAutoGerida(demanda) {
  return Boolean(demanda.atribuidoA && demanda.criadoPor && demanda.atribuidoA === demanda.criadoPor);
}

// Substitui {link} na legenda; se não houver placeholder, anexa o link.
function montarLegenda(legenda, link) {
  const base = legenda || '';
  if (!link) return base;
  if (base.includes('{link}')) return base.replace(/\{link\}/g, link);
  if (base.includes(link)) return base;
  return base ? `${base}\n\n${link}` : link;
}

// scheduledTo em ISO 8601 com offset -03:00 (Brasil).
function montarScheduledTo(dataAlvo, horario) {
  return `${dataAlvo}T${horario}:00-03:00`;
}

/**
 * Aplica as regras e devolve o PLANO de envios (sem chamar o SendFlow).
 * Cada item = uma mensagem (uma chamada separada).
 */
/**
 * PLANO POR SLOTS (feedbacks): a demanda tem espaços nomeados. Cada slot vira
 * uma mensagem — texto (legenda fixa) ou mídia (arquivo daquela ordem).
 */
function montarPlanoSlots(demanda, arquivos) {
  const itens = [];
  const avisos = [];
  const campanhas = (demanda.campanhasDestino || []).map((nome, i) => ({
    nome,
    releaseId: (demanda.releaseIds || [])[i] || null,
  }));
  const shippingSpeed = demanda.velocidade || 'slow';
  const mentionAll = Boolean(demanda.mencionar);

  // Feedbacks são agendados pelo admin assim que a Giselle sobe a mídia — a
  // mídia presente (não rejeitada) já conta como pronta, sem etapa de aprovação.
  const porOrdem = new Map();
  for (const a of arquivos) {
    if (a.status !== 'rejeitado') porOrdem.set(a.ordem, a);
  }

  const slots = [...(demanda.slots || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  for (const slot of slots) {
    if (!slot.horario) { avisos.push(`${slot.nome || 'Espaço'}: sem horário — pulado`); continue; }
    const scheduledTo = montarScheduledTo(demanda.dataAlvo, slot.horario);
    const ehTexto = slot.tipo === 'texto';
    let tipo, url, arquivoId, legenda;

    if (ehTexto) {
      legenda = String(slot.legenda || '').replace(/\{link\}/g, '').trim();
      if (!legenda) { avisos.push(`${slot.nome}: texto vazio — pulado`); continue; }
      tipo = 'text'; url = null; arquivoId = null;
    } else {
      const arq = porOrdem.get(slot.ordem);
      if (!arq) { avisos.push(`${slot.nome} (${slot.horario}): sem mídia — pulado`); continue; }
      tipo = arq.tipo === 'video' ? 'video' : 'image';
      url = arq.cloudinaryUrl;
      arquivoId = arq.id;
      legenda = String(slot.legenda || arq.legendaCustom || '').trim();
    }

    for (const camp of campanhas) {
      if (!camp.releaseId) { avisos.push(`Campanha ${camp.nome} sem releaseId — pulado`); continue; }
      itens.push({
        arquivoId, ordem: slot.ordem, horario: slot.horario, campanha: camp.nome,
        releaseId: camp.releaseId, variante: `slot${slot.ordem}`, tipo, url, legenda,
        shippingSpeed, mentionAll, scheduledTo,
      });
    }
  }
  return { itens, avisos };
}

function montarPlano(demanda, arquivos) {
  if (Array.isArray(demanda.slots) && demanda.slots.length) {
    return montarPlanoSlots(demanda, arquivos);
  }
  const itens = [];
  const avisos = [];

  const campanhas = (demanda.campanhasDestino || []).map((nome, i) => ({
    nome,
    releaseId: (demanda.releaseIds || [])[i] || null,
  }));

  // Auto-gerida: qualquer mídia não rejeitada já está pronta.
  // Fluxo com operador: só as mídias aprovadas pelo admin.
  const autoGerida = ehAutoGerida(demanda);
  const aprovados = arquivos
    .filter((a) => (autoGerida ? a.status !== 'rejeitado' : a.status === 'aprovado'))
    .sort((a, b) => a.ordem - b.ordem);

  if (aprovados.length === 0) {
    avisos.push(autoGerida ? 'Nenhuma mídia para agendar.' : 'Nenhum arquivo aprovado.');
  }

  for (const arq of aprovados) {
    if (!arq.horario) {
      avisos.push(`Arquivo #${arq.ordem + 1} sem horário — ignorado.`);
      continue;
    }

    const categoria = demanda.categoria;
    const ehEntrada = categoria === 'entrada';
    const ehPedido = categoria === 'pedido';

    // velocidade: entrada = normal; resto = lento (fallback demanda.velocidade)
    const shippingSpeed = ehEntrada ? 'normal' : demanda.velocidade || 'slow';

    // menção: SEMPRE opcional e desligada por padrão (90% dos envios são
    // mídia+texto juntos, sem menção). Pedido de lara nunca menciona.
    // Só liga quando a demanda marca `mencionar` explicitamente.
    const mentionAll = ehPedido ? false : Boolean(demanda.mencionar);

    const scheduledTo = montarScheduledTo(demanda.dataAlvo, arq.horario);
    const tipo = arq.tipo === 'video' ? 'video' : 'image';
    const url = arq.cloudinaryUrl;
    const legendaBase = arq.legendaCustom || demanda.legenda || '';
    const linkPrincipal = arq.linkPrincipal || demanda.linkPrincipal || '';
    const linkDois = arq.linkDois || demanda.linkDois || '';

    for (const camp of campanhas) {
      // REGRA: jamais entrada na campanha AQUECIMENTO
      if (ehEntrada && norm(camp.nome) === AQUECIMENTO) {
        avisos.push(`Entrada não vai para ${camp.nome} (regra) — pulado.`);
        continue;
      }
      if (!camp.releaseId) {
        avisos.push(`Campanha ${camp.nome} sem releaseId — pulado.`);
        continue;
      }

      const ehAtivos1 = norm(camp.nome) === norm(ATIVOS1);

      // Mensagem principal (link principal)
      itens.push({
        arquivoId: arq.id,
        ordem: arq.ordem,
        horario: arq.horario,
        campanha: camp.nome,
        releaseId: camp.releaseId,
        variante: 'principal',
        tipo,
        url,
        legenda: montarLegenda(legendaBase, linkPrincipal),
        shippingSpeed,
        mentionAll,
        scheduledTo,
      });

      // REGRA: ATIVOS 1 entrada com 2 links -> segunda mensagem no mesmo horário
      if (ehAtivos1 && ehEntrada && linkDois) {
        itens.push({
          arquivoId: arq.id,
          ordem: arq.ordem,
          horario: arq.horario,
          campanha: camp.nome,
          releaseId: camp.releaseId,
          variante: 'link2',
          tipo,
          url,
          legenda: montarLegenda(legendaBase, linkDois),
          shippingSpeed,
          mentionAll,
          scheduledTo,
        });
      }
    }
  }

  return { itens, avisos };
}

/**
 * PLANO DE TEXTO (provisório): agenda só a legenda como mensagem de texto,
 * pra "reservar" o horário antes da mídia chegar. Depois, ao agendar de vez
 * com a mídia, esses provisórios são apagados e recriados completos.
 */
function montarPlanoTexto(demanda) {
  const itens = [];
  const avisos = [];
  const campanhas = (demanda.campanhasDestino || []).map((nome, i) => ({
    nome,
    releaseId: (demanda.releaseIds || [])[i] || null,
  }));
  const ehEntrada = demanda.categoria === 'entrada';
  const ehPedido = demanda.categoria === 'pedido';
  const shippingSpeed = ehEntrada ? 'normal' : demanda.velocidade || 'slow';
  const mentionAll = ehPedido ? false : Boolean(demanda.mencionar);
  const linkPrincipal = demanda.linkPrincipal || '';
  // com link do dia -> insere no texto; sem link -> remove o {link}
  const legendaBase = linkPrincipal
    ? montarLegenda(demanda.legenda || '', linkPrincipal)
    : String(demanda.legenda || '').replace(/\{link\}/g, '').trim();
  const horarios = (demanda.horarios || []).filter(Boolean);

  if (!String(demanda.legenda || '').trim()) avisos.push('Demanda sem texto para agendar.');

  for (const horario of horarios) {
    const scheduledTo = montarScheduledTo(demanda.dataAlvo, horario);
    for (const camp of campanhas) {
      if (ehEntrada && norm(camp.nome) === AQUECIMENTO) {
        avisos.push(`Entrada não vai para ${camp.nome} (regra) — pulado.`);
        continue;
      }
      if (!camp.releaseId) {
        avisos.push(`Campanha ${camp.nome} sem releaseId — pulado.`);
        continue;
      }
      itens.push({
        arquivoId: null, horario, campanha: camp.nome, releaseId: camp.releaseId,
        variante: 'texto', tipo: 'text', url: null, legenda: legendaBase,
        shippingSpeed, mentionAll, scheduledTo,
      });
    }
  }
  return { itens, avisos };
}

/** Apaga no SendFlow os agendamentos provisórios de texto de uma demanda. */
async function apagarProvisorios(demandaId) {
  const rows = await db
    .select()
    .from(sendflowSchedules)
    .where(and(eq(sendflowSchedules.demandaId, demandaId), eq(sendflowSchedules.variante, 'texto')));
  const ativos = rows.filter((r) => r.status !== 'cancelado');
  const actionIds = [];
  for (const s of ativos) {
    const arr = Array.isArray(s.resultJson?.actionIds) ? s.resultJson.actionIds : [];
    for (const a of arr) if (a) actionIds.push(a);
    if (!arr.length && s.sendflowActionId) actionIds.push(s.sendflowActionId);
  }
  if (actionIds.length) await sendflow.deletarAcoes(actionIds).catch(() => {});
  for (const s of ativos) {
    await db.update(sendflowSchedules).set({ status: 'cancelado' }).where(eq(sendflowSchedules.id, s.id));
  }
  return actionIds.length;
}

/** Agenda só o texto (provisório). */
async function executarAgendamentoTexto(demanda, userId) {
  const { itens, avisos } = montarPlanoTexto(demanda);
  if (itens.length === 0) return { ok: false, error: 'Nada a agendar (sem texto/campanhas)', avisos };
  if (!(await sendflow.estaConfigurado())) return { ok: false, error: 'SendFlow não configurado (Ajustes)', avisos };
  return executarItens(demanda, itens, avisos, userId, 'agendamento-texto');
}

/**
 * Executa o plano com MÍDIA. Antes, apaga os provisórios de texto (troca).
 */
async function executarAgendamento(demanda, arquivos, userId) {
  const { itens, avisos } = montarPlano(demanda, arquivos);

  if (itens.length === 0) {
    return { ok: false, error: 'Nada a agendar', avisos };
  }
  if (!(await sendflow.estaConfigurado())) {
    return { ok: false, error: 'SendFlow não configurado (Ajustes)', avisos };
  }

  // Troca: remove os agendamentos provisórios de texto desta demanda.
  const trocados = await apagarProvisorios(demanda.id);
  if (trocados) avisos.push(`${trocados} ação(ões) de texto provisório substituída(s).`);

  return executarItens(demanda, itens, avisos, userId, 'agendamento');
}

/**
 * Núcleo: busca accountIds frescos por release, chama o SendFlow uma vez por
 * mensagem (por conta), aplica idempotência e salva cada schedule.
 */
async function executarItens(demanda, itens, avisos, userId, tipoJob) {
  // Cria o job de automação (idempotência de execução).
  const idempotencyKey = `${tipoJob}:${demanda.id}:${demanda.updatedAt?.toISOString?.() || Date.now()}`;
  let job;
  try {
    [job] = await db
      .insert(automationJobs)
      .values({
        demandaId: demanda.id,
        type: tipoJob,
        payloadJson: { total: itens.length },
        status: 'processing',
        idempotencyKey,
      })
      .returning();
  } catch {
    // já existe job com essa chave (execução duplicada) — segue sem duplicar
  }

  const accountCache = new Map();
  const resultados = { agendadas: 0, puladas: 0, erros: [] };

  for (const item of itens) {
    // idempotência por mensagem (texto provisório não checa — pode recriar).
    // arquivoId pode ser null (texto/slot de texto) — usar isNull nesse caso,
    // senão `col = NULL` nunca casa e duplicaria em retentativas.
    if (item.variante !== 'texto') {
      const arqCond =
        item.arquivoId == null
          ? isNull(sendflowSchedules.arquivoId)
          : eq(sendflowSchedules.arquivoId, item.arquivoId);
      const jaExiste = await db
        .select({ id: sendflowSchedules.id })
        .from(sendflowSchedules)
        .where(
          and(
            eq(sendflowSchedules.demandaId, demanda.id),
            arqCond,
            eq(sendflowSchedules.releaseId, item.releaseId),
            eq(sendflowSchedules.variante, item.variante)
          )
        )
        .limit(1);
      if (jaExiste.length && jaExiste[0]) {
        resultados.puladas += 1;
        continue;
      }
    }

    // accountIds frescos (cacheados por release nesta execução).
    let accountIds;
    if (accountCache.has(item.releaseId)) {
      accountIds = accountCache.get(item.releaseId);
    } else {
      try {
        accountIds = await sendflow.buscarAccountIds(item.releaseId);
        accountCache.set(item.releaseId, accountIds);
      } catch (err) {
        // Campanha sem chips agora (ex.: AQUECIMENTO de manhã) é AVISO, não
        // erro fatal — não pode travar (400) o agendamento das outras campanhas.
        const semChips = /sem chips/i.test(err.message);
        (semChips ? avisos : resultados.erros).push(`${item.campanha}: ${err.message}`);
        accountCache.set(item.releaseId, null);
        continue;
      }
    }
    if (!accountIds || accountIds.length === 0) continue;

    // UMA ação por campanha, com TODOS os chips (o SendFlow distribui).
    // Com menção -> batch (mídia separada do texto que marca todos).
    const envio = item.mentionAll
      ? await sendflow.agendarComMencao({
          tipo: item.tipo,
          accountIds,
          releaseId: item.releaseId,
          url: item.url,
          mensagem: item.legenda,
          scheduledTo: item.scheduledTo,
          shippingSpeed: item.shippingSpeed,
        })
      : await sendflow.agendarAcao({
          tipo: item.tipo,
          accountIds,
          releaseId: item.releaseId,
          url: item.url,
          mensagem: item.legenda,
          scheduledTo: item.scheduledTo,
          shippingSpeed: item.shippingSpeed,
          mentionAll: item.mentionAll,
        });

    if (!envio.ok) {
      resultados.erros.push(`${item.campanha} ${item.horario} (${item.variante}): ${envio.error}`);
      continue;
    }

    const actionIds = [envio.actionId].filter(Boolean);
    await db.insert(sendflowSchedules).values({
      demandaId: demanda.id,
      automationJobId: job?.id || null,
      arquivoId: item.arquivoId,
      sendflowActionId: envio.actionId || null,
      releaseId: item.releaseId,
      accountIds,
      tipoEnvio: item.tipo,
      mensagemOuUrl: item.url,
      legenda: item.legenda,
      variante: item.variante,
      mencionar: item.mentionAll,
      velocidade: item.shippingSpeed,
      scheduledTo: new Date(item.scheduledTo),
      status: 'agendado',
      resultJson: { actionIds },
    });
    resultados.agendadas += 1;
  }

  // Sucesso = sem erros reais E algo aconteceu (agendou ou já estava agendado).
  const nadaFeito = resultados.agendadas === 0 && resultados.puladas === 0;
  const sucesso = resultados.erros.length === 0 && !nadaFeito;
  if (job) {
    await db
      .update(automationJobs)
      .set({
        status: sucesso ? 'success' : 'error',
        errorMessage: sucesso ? null : resultados.erros.join(' | ').slice(0, 500),
        resultJson: resultados,
        processedAt: new Date(),
      })
      .where(eq(automationJobs.id, job.id));
  }

  return { ok: sucesso, ...resultados, avisos };
}

/**
 * RECONFERÊNCIA DE CHIPS: perto do horário de envio, checa se os chips da
 * campanha mudaram (caíram/entraram) e, se sim, apaga as ações antigas e
 * recria com os chips ATUAIS. Ideal rodar a cada ~5min via ping externo.
 */
async function reconferirChips({ janelaMin = 15 } = {}) {
  if (!(await sendflow.estaConfigurado())) return { ok: false, error: 'SendFlow não configurado' };

  const agora = new Date();
  const limite = new Date(agora.getTime() + janelaMin * 60000);

  const rows = await db
    .select()
    .from(sendflowSchedules)
    .where(
      and(
        eq(sendflowSchedules.status, 'agendado'),
        gte(sendflowSchedules.scheduledTo, agora),
        lte(sendflowSchedules.scheduledTo, limite)
      )
    );

  const cacheChips = new Map();
  const res = { verificados: rows.length, reagendados: 0, semMudanca: 0, erros: [] };

  for (const s of rows) {
    let atuais;
    try {
      atuais = cacheChips.get(s.releaseId);
      if (!atuais) {
        atuais = await sendflow.buscarAccountIds(s.releaseId);
        cacheChips.set(s.releaseId, atuais);
      }
    } catch (e) {
      res.erros.push(`${s.releaseId}: ${e.message}`);
      continue;
    }

    const antes = [...(s.accountIds || [])].map(String).sort().join(',');
    const depois = [...atuais].map(String).sort().join(',');
    if (antes === depois) { res.semMudanca += 1; continue; }

    // mudou -> apaga ações antigas e recria com os chips atuais
    const antigos = Array.isArray(s.resultJson?.actionIds)
      ? s.resultJson.actionIds.filter(Boolean)
      : (s.sendflowActionId ? [s.sendflowActionId] : []);
    if (antigos.length) await sendflow.deletarAcoes(antigos).catch(() => {});

    const scheduledTo = new Date(s.scheduledTo).toISOString();
    const comum = {
      tipo: s.tipoEnvio,
      accountIds: atuais,
      releaseId: s.releaseId,
      url: s.tipoEnvio === 'text' ? null : s.mensagemOuUrl,
      mensagem: s.legenda || '',
      scheduledTo,
      shippingSpeed: s.velocidade || 'slow',
    };
    const envio = s.mencionar
      ? await sendflow.agendarComMencao(comum)
      : await sendflow.agendarAcao({ ...comum, mentionAll: Boolean(s.mencionar) });

    if (!envio.ok) {
      res.erros.push(`${s.releaseId} ${scheduledTo}: falha ao recriar — ${envio.error}`);
      continue;
    }

    const novos = [envio.actionId].filter(Boolean);
    await db
      .update(sendflowSchedules)
      .set({
        accountIds: atuais,
        sendflowActionId: envio.actionId || null,
        resultJson: { actionIds: novos, reagendado: true, em: agora.toISOString() },
      })
      .where(eq(sendflowSchedules.id, s.id));
    res.reagendados += 1;
  }

  return { ok: true, ...res };
}

module.exports = {
  montarPlano, montarPlanoTexto, executarAgendamento, executarAgendamentoTexto,
  apagarProvisorios, reconferirChips, montarLegenda, montarScheduledTo, ehAutoGerida,
};
