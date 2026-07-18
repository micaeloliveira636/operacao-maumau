const { and, eq, gte, lte, isNull, inArray } = require('drizzle-orm');
const { db } = require('../db');
const { sendflowSchedules, automationJobs } = require('../db/schema');
const sendflow = require('../utils/sendflow');

// Nome canônico das campanhas (o que casa com a regra de AQUECIMENTO).
const AQUECIMENTO = 'AQUECIMENTO';
const ATIVOS1 = 'ATIVOS 1';

function norm(s) {
  return String(s || '').trim().toUpperCase();
}

// SEGMENTAÇÃO ATIVOS 1 (entrada com 2 links): por NOME de grupo.
//  - link 2  -> grupos com ⚜️ (TRAMPO VIP / OPERAÇÃO MAUMAU)
//  - link 1  -> o resto (COMUNIDADE MAUMAU + LARAS MAUMAU)
// Regra por nome (não por id) pra pegar grupos novos automaticamente.
function ehGrupoLink2(nome) {
  return /⚜️|⚜|TRAMPO\s*VIP|OPERA[ÇC][ÃA]O/i.test(String(nome || ''));
}
// Divide a lista de grupos { id, gid, name } nos dois conjuntos.
// IMPORTANTE: usa o `gid` (ID do grupo no WhatsApp) — é o que o envio por
// grupos exige. Usar o `id` do doc faz o envio ficar sem grupo nenhum.
function dividirGruposPorLink(grupos) {
  const link2 = [], link1 = [];
  for (const g of grupos || []) (ehGrupoLink2(g.name) ? link2 : link1).push(String(g.gid || g.id));
  return { link1, link2 };
}

// Grupos específicos do AQUECIMENTO (gids) escolhidos na demanda — só valem pro
// envio à campanha AQUECIMENTO (pedidos / feedbacks de lara). Vazio = campanha
// inteira. Devolve o array de gids ou undefined (não segmenta).
function gruposAquecDoItem(demanda, campNome) {
  const g = demanda.gruposAquecimento;
  if (norm(campNome) === AQUECIMENTO && Array.isArray(g) && g.length) return g.filter(Boolean).map(String);
  return undefined;
}

// Detecta o bloqueio de API key do SendFlow (403 api-key-blocked) e estima em
// quantas horas libera. Quando bloqueado, NÃO adianta seguir chamando —
// paramos na hora pra não prolongar a punição.
function ehBloqueioKey(msg) {
  return /api-key-blocked/i.test(String(msg || ''));
}
function horasBloqueio(msg) {
  const m = String(msg || '').match(/retryAfterMs"?\s*:\s*(\d+)/);
  return m ? Math.max(1, Math.ceil(Number(m[1]) / 3600000)) : null;
}
function msgBloqueio(msg) {
  const h = horasBloqueio(msg);
  return `SendFlow bloqueou a API key temporariamente${h ? ` (~${h}h p/ liberar)` : ''}. Envio interrompido — nada mais foi criado. Troque o token em Ajustes ou aguarde.`;
}

// Rate limit temporário (429 / rate-limit-exceeded). O limitador do SendFlow
// conta violações — insistir só piora. Ao detectar, paramos o lote na hora e
// mandamos aguardar; o que já foi agendado fica salvo.
function ehRateLimit(msg) {
  return /rate-limit-exceeded|\b429\b/i.test(String(msg || ''));
}
function segsEspera(msg) {
  const m = String(msg || '').match(/retryAfterMs"?\s*:\s*(\d+)/);
  return m ? Math.max(1, Math.ceil(Number(m[1]) / 1000)) : 60;
}
function msgRateLimit(msg) {
  return `Limite de requisições do SendFlow atingido — aguarde ~${segsEspera(msg)}s e reagende. O que já foi agendado está salvo (nada foi duplicado).`;
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

// Horário JÁ PASSOU? Nunca agendar pro passado — o SendFlow, ao receber uma
// data passada, acaba disparando na hora errada (ex.: mídia posta num pedido de
// 15h de ONTEM saiu hoje no horário errado). Bloqueio no motor.
function jaPassou(scheduledTo) {
  const t = new Date(scheduledTo).getTime();
  return Number.isFinite(t) && t <= Date.now();
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
        gruposAquec: gruposAquecDoItem(demanda, camp.nome),
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
      // Vai dividir por grupos? Só ATIVOS 1 entrada com 2 links. Aí o principal
      // vai só pros grupos do link 1 e o 2º link só pros grupos ⚜️.
      const vaiDividir = ehAtivos1 && ehEntrada && Boolean(linkDois);

      // Mensagem principal (link principal)
      itens.push({
        arquivoId: arq.id,
        ordem: arq.ordem,
        horario: arq.horario,
        campanha: camp.nome,
        releaseId: camp.releaseId,
        variante: 'principal',
        grupoFiltro: vaiDividir ? 'link1' : null,
        gruposAquec: gruposAquecDoItem(demanda, camp.nome),
        tipo,
        url,
        legenda: montarLegenda(legendaBase, linkPrincipal),
        shippingSpeed,
        mentionAll,
        scheduledTo,
      });

      // REGRA: ATIVOS 1 entrada com 2 links -> segunda mensagem no mesmo horário
      if (vaiDividir) {
        itens.push({
          arquivoId: arq.id,
          ordem: arq.ordem,
          horario: arq.horario,
          campanha: camp.nome,
          releaseId: camp.releaseId,
          variante: 'link2',
          grupoFiltro: 'link2',
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
  const linkDois = demanda.linkDois || '';
  // monta a legenda com um link específico; sem link -> remove o {link}
  const legendaCom = (link) =>
    link
      ? montarLegenda(demanda.legenda || '', link)
      : String(demanda.legenda || '').replace(/\{link\}/g, '').trim();
  const legendaBase = legendaCom(linkPrincipal);
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
      const vaiDividir = ehEntrada && norm(camp.nome) === norm(ATIVOS1) && Boolean(linkDois);
      itens.push({
        arquivoId: null, horario, campanha: camp.nome, releaseId: camp.releaseId,
        variante: 'texto', grupoFiltro: vaiDividir ? 'link1' : null,
        gruposAquec: gruposAquecDoItem(demanda, camp.nome),
        tipo: 'text', url: null, legenda: legendaBase,
        shippingSpeed, mentionAll, scheduledTo,
      });
      // REGRA: ATIVOS 1 entrada com 2 links -> segunda mensagem (2º link) no
      // mesmo horário. Igual ao plano com mídia — o provisório também precisa
      // reservar as DUAS mensagens, senão o 2º link fica de fora. O principal
      // vai só pros grupos do link 1 e este 2º link só pros grupos ⚜️.
      if (vaiDividir) {
        itens.push({
          arquivoId: null, horario, campanha: camp.nome, releaseId: camp.releaseId,
          variante: 'texto-link2', grupoFiltro: 'link2',
          tipo: 'text', url: null, legenda: legendaCom(linkDois),
          shippingSpeed, mentionAll, scheduledTo,
        });
      }
    }
  }
  return { itens, avisos };
}

/** Apaga no SendFlow os agendamentos provisórios de texto de uma demanda. */
async function apagarProvisorios(demandaId) {
  const rows = await db
    .select()
    .from(sendflowSchedules)
    .where(and(
      eq(sendflowSchedules.demandaId, demandaId),
      inArray(sendflowSchedules.variante, ['texto', 'texto-link2'])
    ));
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

/**
 * Apaga no SendFlow TODAS as ações agendadas de uma demanda (qualquer variante).
 * Usado ao excluir a demanda, pra não deixar envios órfãos no SendFlow.
 */
async function apagarAcoesDaDemanda(demandaId) {
  const rows = await db
    .select()
    .from(sendflowSchedules)
    .where(eq(sendflowSchedules.demandaId, demandaId));
  const actionIds = [];
  for (const s of rows) {
    if (s.status === 'cancelado') continue;
    const arr = Array.isArray(s.resultJson?.actionIds) ? s.resultJson.actionIds.filter(Boolean) : [];
    for (const a of arr) actionIds.push(a);
    if (!arr.length && s.sendflowActionId) actionIds.push(s.sendflowActionId);
  }
  if (actionIds.length) await sendflow.deletarAcoes(actionIds).catch(() => {});
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
  // A coluna `type` tem um CHECK que só aceita agendamento|notificacao|
  // cancelamento — então gravamos 'agendamento' e guardamos o tipo real
  // (ex.: agendamento-texto) no payload e na chave de idempotência.
  const tipoDb = ['agendamento', 'notificacao', 'cancelamento'].includes(tipoJob) ? tipoJob : 'agendamento';
  const idempotencyKey = `${tipoJob}:${demanda.id}:${demanda.updatedAt?.toISOString?.() || Date.now()}`;
  let job;
  try {
    [job] = await db
      .insert(automationJobs)
      .values({
        demandaId: demanda.id,
        type: tipoDb,
        payloadJson: { total: itens.length, tipo: tipoJob },
        status: 'processing',
        idempotencyKey,
      })
      .returning();
  } catch (e) {
    // Duplicado (mesma chave) é esperado; outros erros a gente loga, mas não
    // derruba o agendamento (o job é só rastreio interno).
    if (!/duplicate|unique/i.test(e?.cause?.message || e?.message || '')) {
      console.error('Falha ao criar automation_job (seguindo mesmo assim):', e?.cause?.message || e?.message);
    }
  }

  const accountCache = new Map();
  const grupoCache = new Map(); // releaseId -> { link1:[ids], link2:[ids] }
  const resultados = { agendadas: 0, puladas: 0, erros: [] };

  for (const item of itens) {
    // NUNCA agenda pra um horário que já passou (senão o SendFlow envia na hora
    // errada). Ex.: mídia posta num pedido de 15h de ONTEM.
    if (jaPassou(item.scheduledTo)) {
      avisos.push(`${item.campanha} ${item.horario}: horário já passou — não agendado.`);
      continue;
    }

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
        if (ehBloqueioKey(err.message)) {
          resultados.bloqueado = true;
          resultados.erros.push(msgBloqueio(err.message));
          break;
        }
        if (ehRateLimit(err.message)) {
          resultados.rateLimited = true;
          resultados.erros.push(msgRateLimit(err.message));
          break;
        }
        // Campanha sem chips agora (ex.: AQUECIMENTO de manhã) é AVISO, não
        // erro fatal — não pode travar (400) o agendamento das outras campanhas.
        const semChips = /sem chips/i.test(err.message);
        (semChips ? avisos : resultados.erros).push(`${item.campanha}: ${err.message}`);
        accountCache.set(item.releaseId, null);
        continue;
      }
    }
    if (!accountIds || accountIds.length === 0) continue;

    // SEGMENTAÇÃO POR GRUPOS (ATIVOS 1 entrada, 2 links): resolve os grupos do
    // release e escolhe o conjunto conforme o item (link1 = COMUNIDADE+LARAS,
    // link2 = ⚜️). Sem grupoFiltro -> release inteira (grupoIds undefined).
    let grupoIds;
    if (item.grupoFiltro) {
      let grupos;
      if (grupoCache.has(item.releaseId)) {
        grupos = grupoCache.get(item.releaseId);
      } else {
        try {
          grupos = dividirGruposPorLink(await sendflow.buscarGrupos(item.releaseId));
          grupoCache.set(item.releaseId, grupos);
        } catch (err) {
          if (ehBloqueioKey(err.message)) { resultados.bloqueado = true; resultados.erros.push(msgBloqueio(err.message)); break; }
          if (ehRateLimit(err.message)) { resultados.rateLimited = true; resultados.erros.push(msgRateLimit(err.message)); break; }
          resultados.erros.push(`${item.campanha} (grupos): ${err.message}`);
          grupoCache.set(item.releaseId, null);
          continue;
        }
      }
      if (!grupos) continue;
      grupoIds = item.grupoFiltro === 'link2' ? grupos.link2 : grupos.link1;
      if (!grupoIds.length) {
        avisos.push(`${item.campanha} ${item.horario}: nenhum grupo para ${item.grupoFiltro} — pulado.`);
        continue;
      }
    } else if (Array.isArray(item.gruposAquec) && item.gruposAquec.length) {
      // Grupos específicos do AQUECIMENTO escolhidos na demanda (gids diretos).
      grupoIds = item.gruposAquec;
    }

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
          grupoIds,
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
          grupoIds,
        });

    if (!envio.ok) {
      // Bloqueio de API key: para tudo na hora (não adianta seguir chamando).
      if (ehBloqueioKey(envio.error)) {
        resultados.bloqueado = true;
        resultados.erros.push(msgBloqueio(envio.error));
        break;
      }
      // Rate limit: para o lote (insistir gera mais violação).
      if (ehRateLimit(envio.error)) {
        resultados.rateLimited = true;
        resultados.erros.push(msgRateLimit(envio.error));
        break;
      }
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
      // coluna NOT NULL: em texto não há url -> guarda a mensagem (legenda).
      // Sem isso, o insert do provisório de texto estourava e a ação ficava
      // órfã no SendFlow (o apagarProvisorios não achava registro pra remover).
      mensagemOuUrl: item.url || item.legenda || '',
      legenda: item.legenda,
      variante: item.variante,
      mencionar: item.mentionAll,
      velocidade: item.shippingSpeed,
      scheduledTo: new Date(item.scheduledTo),
      status: 'agendado',
      // grupoFiltro/gruposAquec/grupoIds guardados p/ o reconferirChips
      // re-segmentar e detectar GRUPO NOVO na campanha antes do envio.
      resultJson: {
        actionIds,
        grupoFiltro: item.grupoFiltro || null,
        gruposAquec: item.gruposAquec || null,
        grupoIds: grupoIds || null,
      },
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
  const cacheGrupos = new Map(); // releaseId -> { link1, link2 } (1 busca por release)
  const res = { verificados: rows.length, reagendados: 0, semMudanca: 0, textoPulado: 0, erros: [] };

  for (const s of rows) {
    let atuais;
    try {
      atuais = cacheChips.get(s.releaseId);
      if (!atuais) {
        // fresh: o cron É quem detecta mudança de chip — não pode usar cache.
        atuais = await sendflow.buscarAccountIds(s.releaseId, { fresh: true });
        cacheChips.set(s.releaseId, atuais);
      }
    } catch (e) {
      if (ehBloqueioKey(e.message)) {
        res.bloqueado = true;
        res.erros.push(msgBloqueio(e.message));
        break; // não segue chamando com a key bloqueada (evita novas violações)
      }
      if (ehRateLimit(e.message)) {
        res.rateLimited = true;
        res.erros.push(msgRateLimit(e.message));
        break; // idem: rate limit conta violação, parar já
      }
      res.erros.push(`${s.releaseId}: ${e.message}`);
      continue;
    }

    // GRUPOS ATUAIS (antes de decidir recriar). Isso é essencial: um grupo que
    // sai do AQUECIMENTO e entra no ATIVOS 1 DEPOIS do agendamento não estaria
    // na lista fixa da ação e ficaria SEM a entrada. Como o link1/link2 é uma
    // REGRA por nome, recalculamos e recriamos se o conjunto mudou.
    let grupoIds;
    let gruposMudaram = false;
    const grupoFiltro = s.resultJson?.grupoFiltro || null;
    const gruposAquec = Array.isArray(s.resultJson?.gruposAquec) ? s.resultJson.gruposAquec : null;
    if (grupoFiltro) {
      try {
        let div = cacheGrupos.get(s.releaseId);
        if (!div) {
          div = dividirGruposPorLink(await sendflow.buscarGrupos(s.releaseId, { fresh: true }));
          cacheGrupos.set(s.releaseId, div);
        }
        grupoIds = grupoFiltro === 'link2' ? div.link2 : div.link1;
      } catch (e) {
        if (ehBloqueioKey(e.message)) { res.bloqueado = true; res.erros.push(msgBloqueio(e.message)); break; }
        if (ehRateLimit(e.message)) { res.rateLimited = true; res.erros.push(msgRateLimit(e.message)); break; }
        res.erros.push(`${s.releaseId} (grupos): ${e.message}`);
        continue;
      }
      if (!grupoIds || !grupoIds.length) {
        res.erros.push(`${s.releaseId}: sem grupos para ${grupoFiltro} ao reconferir — pulado.`);
        continue;
      }
      const gAntes = [...(s.resultJson?.grupoIds || [])].map(String).sort().join(',');
      const gDepois = [...grupoIds].map(String).sort().join(',');
      // sem registro anterior não dá pra comparar — não força recriação à toa
      gruposMudaram = Boolean(gAntes) && gAntes !== gDepois;
    } else if (gruposAquec && gruposAquec.length) {
      // AQUECIMENTO: lista escolhida à mão pelo admin — não muda sozinha.
      grupoIds = gruposAquec;
    }

    // TEXTO (provisório): em regra NÃO se mexe — o admin às vezes completa a
    // mensagem com a MÍDIA direto no SendFlow e recriar apagaria essa mídia.
    // ÚNICA exceção: um GRUPO entrou/saiu da campanha; aí é obrigatório recriar,
    // senão o grupo novo (ex.: veio do AQUECIMENTO pro ATIVOS 1) fica SEM a
    // mensagem de entrada. Troca de chip sozinha não justifica mexer no texto.
    if (s.tipoEnvio === 'text' && !gruposMudaram) { res.textoPulado += 1; continue; }

    const antes = [...(s.accountIds || [])].map(String).sort().join(',');
    const depois = [...atuais].map(String).sort().join(',');
    const chipsMudaram = antes !== depois;
    if (!chipsMudaram && !gruposMudaram) { res.semMudanca += 1; continue; }

    // mudou (chip e/ou grupo) -> apaga ações antigas e recria
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
      grupoIds,
    };
    const envio = s.mencionar
      ? await sendflow.agendarComMencao(comum)
      : await sendflow.agendarAcao({ ...comum, mentionAll: Boolean(s.mencionar) });

    if (!envio.ok) {
      if (ehBloqueioKey(envio.error)) {
        res.bloqueado = true;
        res.erros.push(msgBloqueio(envio.error));
        break;
      }
      if (ehRateLimit(envio.error)) {
        res.rateLimited = true;
        res.erros.push(msgRateLimit(envio.error));
        break;
      }
      res.erros.push(`${s.releaseId} ${scheduledTo}: falha ao recriar — ${envio.error}`);
      continue;
    }

    const novos = [envio.actionId].filter(Boolean);
    await db
      .update(sendflowSchedules)
      .set({
        accountIds: atuais,
        sendflowActionId: envio.actionId || null,
        resultJson: { actionIds: novos, reagendado: true, em: agora.toISOString(), grupoFiltro, gruposAquec, grupoIds: grupoIds || null },
      })
      .where(eq(sendflowSchedules.id, s.id));
    res.reagendados += 1;
  }

  return { ok: true, ...res };
}

module.exports = {
  montarPlano, montarPlanoTexto, executarAgendamento, executarAgendamentoTexto,
  apagarProvisorios, apagarAcoesDaDemanda, reconferirChips, montarLegenda, montarScheduledTo, ehAutoGerida, jaPassou,
};
