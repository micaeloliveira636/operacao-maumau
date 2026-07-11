const { and, eq } = require('drizzle-orm');
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
function montarPlano(demanda, arquivos) {
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
 * Executa o plano: busca accountIds frescos por release, chama o SendFlow
 * uma vez por mensagem, aplica idempotência e salva cada schedule.
 */
async function executarAgendamento(demanda, arquivos, userId) {
  const { itens, avisos } = montarPlano(demanda, arquivos);

  if (itens.length === 0) {
    return { ok: false, error: 'Nada a agendar', avisos };
  }
  if (!(await sendflow.estaConfigurado())) {
    return { ok: false, error: 'SendFlow não configurado (Ajustes)', avisos };
  }

  // Cria o job de automação (idempotência de execução).
  const idempotencyKey = `agendar:${demanda.id}:${demanda.updatedAt?.toISOString?.() || Date.now()}`;
  let job;
  try {
    [job] = await db
      .insert(automationJobs)
      .values({
        demandaId: demanda.id,
        type: 'agendamento',
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
    // idempotência por mensagem
    const jaExiste = await db
      .select({ id: sendflowSchedules.id })
      .from(sendflowSchedules)
      .where(
        and(
          eq(sendflowSchedules.demandaId, demanda.id),
          eq(sendflowSchedules.arquivoId, item.arquivoId),
          eq(sendflowSchedules.releaseId, item.releaseId),
          eq(sendflowSchedules.variante, item.variante)
        )
      )
      .limit(1);
    if (jaExiste.length && jaExiste[0]) {
      resultados.puladas += 1;
      continue;
    }

    // accountIds frescos (cacheados por release dentro desta execução)
    let accountIds = accountCache.get(item.releaseId);
    if (!accountIds) {
      try {
        accountIds = await sendflow.buscarAccountIds(item.releaseId);
        accountCache.set(item.releaseId, accountIds);
      } catch (err) {
        resultados.erros.push(`Release ${item.campanha}: ${err.message}`);
        continue;
      }
    }

    // O SendFlow envia POR CONTA: uma chamada para cada accountId do release.
    const actionIds = [];
    const falhasConta = [];
    for (const accountId of accountIds) {
      const envio = await sendflow.agendarAcao({
        tipo: item.tipo,
        accountId,
        releaseId: item.releaseId,
        url: item.url,
        mensagem: item.legenda,
        scheduledTo: item.scheduledTo,
        shippingSpeed: item.shippingSpeed,
        mentionAll: item.mentionAll,
      });
      if (envio.ok) actionIds.push(envio.actionId || null);
      else falhasConta.push(`${accountId}: ${envio.error}`);
    }

    if (actionIds.length === 0) {
      resultados.erros.push(
        `${item.campanha} ${item.horario} (${item.variante}): ${falhasConta[0] || 'falha em todas as contas'}`
      );
      continue;
    }
    if (falhasConta.length) {
      resultados.erros.push(
        `${item.campanha} ${item.horario}: ${falhasConta.length}/${accountIds.length} conta(s) falharam`
      );
    }

    await db.insert(sendflowSchedules).values({
      demandaId: demanda.id,
      automationJobId: job?.id || null,
      arquivoId: item.arquivoId,
      sendflowActionId: actionIds[0] || null,
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
      resultJson: { actionIds, falhasConta },
    });
    resultados.agendadas += 1;
  }

  const sucesso = resultados.erros.length === 0;
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

module.exports = { montarPlano, executarAgendamento, montarLegenda, montarScheduledTo, ehAutoGerida };
