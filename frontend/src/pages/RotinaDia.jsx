import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CAMPANHAS } from '../lib/constants';
import {
  PASTAS_AQUECIMENTO, modelosDaPasta, MODELOS, SLOTS, aplicarSlot, modelosDaEntrada,
} from '../lib/modelos';
import { montarRotina, nomeDoDia, diaDaSemana } from '../lib/rotina';
import { Select, ModelPicker, Spinner } from '../components/ui';
import { SuccessOverlay } from '../components/SuccessOverlay';
import { Icon } from '../components/Icon';

const releaseDe = (nome) => CAMPANHAS.find((c) => c.nome === nome)?.releaseId || '';
const releasesDe = (nomes) => nomes.map(releaseDe);
const FEEDBACKS = [
  { value: 'feedback-entrada', label: 'Feedback entrada' },
  { value: 'feedback-lara', label: 'Feedback lara' },
  { value: 'feedback-saque', label: 'Feedback saque' },
];
const semLabel = (m) => (m?.label || '').replace(/^\S+\s—\s/, '');

const emptyAquec = () =>
  Object.fromEntries(PASTAS_AQUECIMENTO.map((p) => [p.id, { on: false, modeloId: '', hora: p.hora }]));

export default function RotinaDia() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { data: usuariosData } = useFetch('/usuarios', []);
  // Só operadores (ex.: Giselle) — feedbacks são atribuídos a eles, não ao admin.
  const operadores = (usuariosData?.usuarios || []).filter((u) => u.ativo && u.role === 'operador');

  const [dataAlvo, setDataAlvo] = useState(new Date().toISOString().slice(0, 10));
  const [sabadoModo, setSabadoModo] = useState(2);
  const [quintaModo, setQuintaModo] = useState('normal');
  const [linkDia, setLinkDia] = useState({ principal: '', dois: '' });
  const [enviando, setEnviando] = useState(false);
  const [criadas, setCriadas] = useState(null);

  const [bomDia, setBomDia] = useState({ on: false, hora: '10:00', modeloId: '' });
  const [aquec, setAquec] = useState(emptyAquec);
  const [pedidos, setPedidos] = useState([]);
  const [entradas, setEntradas] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [feedbackResp, setFeedbackResp] = useState('');

  const setPasta = (id, patch) => setAquec((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
  const ehSabado = diaDaSemana(dataAlvo) === 6;
  const ehQuinta = diaDaSemana(dataAlvo) === 4;

  // responsável dos feedbacks começa no primeiro operador (ex.: Giselle)
  useEffect(() => {
    if (!feedbackResp && operadores[0]) setFeedbackResp(operadores[0].id);
  }, [operadores, feedbackResp]);

  // Mapeia os grupos de feedback do roteiro pro formato editável da tela.
  function mapearFeedbacks(gs) {
    const fbModelos = MODELOS['feedback-entrada'] || [];
    return (gs || []).map((g) => ({
      categoria: g.categoria,
      titulo: g.titulo,
      // Campanha padrão vem do roteiro (lara 19h=aquec; 13h/15h=aquec ou +ativos
      // no sistema novo; entrada=ativos). Editável no toggle depois.
      campanhas: g.campanhas || (g.categoria === 'feedback-lara' ? ['AQUECIMENTO'] : ['ATIVOS 1', 'ATIVOS 2']),
      slots: g.slots.map((s) => ({
        ordem: s.ordem, nome: s.nome, horario: s.horario, tipo: s.tipo,
        legenda: fbModelos.find((m) => m.id === s.legendaId)?.texto || '',
      })),
    }));
  }

  function preencher() {
    const r = montarRotina(dataAlvo, { sabadoModo, quintaModo });
    setBomDia(r.bomDia);
    setAquec(r.aquec);
    setPedidos(r.pedidos);
    setEntradas(r.entradas);
    setFeedbacks(mapearFeedbacks(r.feedbacks));
    toast.sucesso(`Roteiro de ${nomeDoDia(dataAlvo)} preenchido${r.sistemaNovo ? ' (sistema novo)' : ''}`);
  }

  // Preenche SÓ os feedbacks do dia (sem mexer em bom dia/aquecimento/pedidos/
  // entradas). Pra quando você quer subir só o monte de feedbacks manualmente.
  function preencherFeedbacks() {
    const r = montarRotina(dataAlvo, { sabadoModo, quintaModo });
    setFeedbacks(mapearFeedbacks(r.feedbacks));
    toast.sucesso(`Feedbacks de ${nomeDoDia(dataAlvo)} preenchidos`);
  }

  // pedidos
  const setPedido = (i, patch) => setPedidos((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addPedido = () => setPedidos((p) => [...p, { hora: '', campanhas: ['AQUECIMENTO'], modeloId: '' }]);
  const delPedido = (i) => setPedidos((p) => p.filter((_, idx) => idx !== i));
  const toggleCampPedido = (i, nome) =>
    setPedidos((p) => p.map((x, idx) => {
      if (idx !== i) return x;
      const has = x.campanhas.includes(nome);
      return { ...x, campanhas: has ? x.campanhas.filter((c) => c !== nome) : [...x.campanhas, nome] };
    }));

  // entradas
  const setEntrada = (i, patch) => setEntradas((e) => e.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addEntrada = () => setEntradas((e) => [...e, { hora: '', slot: SLOTS[0], modeloId: '', texto: '' }]);
  // Texto da entrada a partir da variação escolhida + slot ({slot} aplicado, {link} mantido).
  const textoEntrada = (hora, modeloId, slot) => {
    const m = modelosDaEntrada(hora).find((x) => x.id === modeloId);
    return m ? aplicarSlot(m.texto, slot) : '';
  };
  // Ao trocar variação/slot, recria o texto editável (a menos que já editado à mão).
  const escolherVariacao = (i, e, modeloId) => setEntrada(i, { modeloId, texto: textoEntrada(e.hora, modeloId, e.slot) });
  const escolherSlot = (i, e, slot) => setEntrada(i, { slot, texto: e.modeloId ? textoEntrada(e.hora, e.modeloId, slot) : e.texto });
  const delEntrada = (i) => setEntradas((e) => e.filter((_, idx) => idx !== i));

  // feedbacks (grupos com espaços)
  const delGrupo = (i) => setFeedbacks((f) => f.filter((_, idx) => idx !== i));
  const toggleCampFeedback = (i, nome) =>
    setFeedbacks((f) => f.map((g, idx) => {
      if (idx !== i) return g;
      const camps = g.campanhas || ['ATIVOS 1', 'ATIVOS 2'];
      const has = camps.includes(nome);
      return { ...g, campanhas: has ? camps.filter((c) => c !== nome) : [...camps, nome] };
    }));

  const specs = useMemo(() => {
    const out = [];
    if (bomDia.on && bomDia.hora) {
      const m = (MODELOS['bom-dia'] || []).find((x) => x.id === bomDia.modeloId);
      out.push({
        titulo: `Bom dia ${bomDia.hora}`, categoria: 'bom-dia', dataAlvo, horarios: [bomDia.hora],
        legenda: m?.texto || '', campanhasDestino: ['AQUECIMENTO', 'ATIVOS 1', 'ATIVOS 2'],
        releaseIds: releasesDe(['AQUECIMENTO', 'ATIVOS 1', 'ATIVOS 2']), atribuidoA: user?.id, velocidade: 'slow',
      });
    }
    for (const p of PASTAS_AQUECIMENTO) {
      const st = aquec[p.id];
      if (!st?.on || !st.modeloId) continue;
      const m = modelosDaPasta(p.id).find((x) => x.id === st.modeloId);
      if (!m) continue;
      const camps = p.campanhas || ['AQUECIMENTO', 'ATIVOS 1', 'ATIVOS 2'];
      out.push({
        titulo: `Aquecimento ${p.label}`, categoria: 'aquecimento', dataAlvo, horarios: [st.hora || p.hora],
        legenda: m.texto, campanhasDestino: camps, releaseIds: releasesDe(camps),
        atribuidoA: user?.id, velocidade: 'slow',
      });
    }
    for (const pd of pedidos) {
      if (!pd.hora || pd.campanhas.length === 0) continue;
      const m = MODELOS.pedido.find((x) => x.id === pd.modeloId);
      out.push({
        titulo: `Pedido ${pd.hora}`, categoria: 'pedido', dataAlvo, horarios: [pd.hora],
        legenda: m?.texto || '', campanhasDestino: pd.campanhas, releaseIds: releasesDe(pd.campanhas),
        atribuidoA: user?.id, velocidade: 'slow',
      });
    }
    for (const e of entradas) {
      // texto editado tem prioridade; senão usa a variação escolhida
      const legenda = e.texto?.trim() ? e.texto : textoEntrada(e.hora, e.modeloId, e.slot);
      if (!e.hora || !legenda.trim()) continue;
      out.push({
        titulo: `Entrada ${e.hora}${e.slot ? ` — ${e.slot}` : ''}`, categoria: 'entrada', dataAlvo, horarios: [e.hora],
        legenda, campanhasDestino: ['ATIVOS 1', 'ATIVOS 2'],
        releaseIds: releasesDe(['ATIVOS 1', 'ATIVOS 2']), atribuidoA: user?.id, velocidade: 'normal',
        linkPrincipal: linkDia.principal || null, linkDois: linkDia.dois || null,
      });
    }
    for (const g of feedbacks) {
      if (!feedbackResp || !g.slots?.length) continue;
      const camps = g.campanhas?.length ? g.campanhas : ['ATIVOS 1', 'ATIVOS 2'];
      out.push({
        titulo: g.titulo, categoria: g.categoria, dataAlvo,
        horarios: g.slots.map((s) => s.horario),
        slots: g.slots.map((s) => ({ ordem: s.ordem, nome: s.nome, horario: s.horario, legenda: s.legenda || '', tipo: s.tipo })),
        campanhasDestino: camps, releaseIds: releasesDe(camps),
        atribuidoA: feedbackResp, velocidade: 'slow',
      });
    }
    return out;
  }, [bomDia, aquec, pedidos, entradas, feedbacks, feedbackResp, dataAlvo, linkDia, user]);

  async function onSubmit() {
    if (specs.length === 0) return toast.erro('Monte ao menos uma demanda para o dia');
    setEnviando(true);
    try {
      const { demandas, textosAgendados = 0, errosTexto = [] } = await api.post('/demandas/rotina', { demandas: specs });
      if (errosTexto.length) toast.erro(`Alguns textos falharam: ${errosTexto.slice(0, 2).join(' | ')}`);
      setCriadas({ total: demandas?.length || specs.length, textos: textosAgendados });
    } catch (err) {
      toast.erro(err.message || 'Erro ao montar o dia');
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      {criadas != null && (
        <SuccessOverlay
          message={`${criadas.total} demanda(s) · ${criadas.textos} texto(s) agendado(s)`}
          onDone={() => navigate('/board')}
        />
      )}
      <button onClick={() => navigate(-1)} className="link-quiet mb-4 inline-flex items-center gap-1.5 text-sm">
        <Icon name="arrowLeft" className="h-4 w-4" /> Voltar
      </button>
      <h1 className="page-title">Montar o dia</h1>
      <p className="page-sub">Escolha a data e toque em “Preencher pelo dia” — depois é só ajustar e subir as mídias.</p>

      <div className="mt-5 space-y-4 sm:space-y-5">
        <div className="card card-pad space-y-3">
          <div>
            <label className="label">Data do dia</label>
            <input type="date" className="input sm:max-w-xs" value={dataAlvo} onChange={(e) => setDataAlvo(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">{nomeDoDia(dataAlvo)}</p>
          </div>
          {ehSabado && (
            <div>
              <label className="label">Modo do sábado</label>
              <div className="grid grid-cols-2 gap-2">
                {[2, 3].map((n) => (
                  <button key={n} type="button" onClick={() => setSabadoModo(n)}
                    className={`rounded-xl border px-3 py-2 text-sm transition ${sabadoModo === n ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 bg-white/[0.02] text-slate-300'}`}>
                    {n} entradas
                  </button>
                ))}
              </div>
            </div>
          )}
          {ehQuinta && (
            <div>
              <label className="label">Modo da quinta</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: 'normal', t: 'Normal', s: '1 pedido · 3 entradas' },
                  { v: 'segunda', t: 'Como segunda', s: '3 pedidos · 2 entradas' },
                ].map((o) => (
                  <button key={o.v} type="button" onClick={() => setQuintaModo(o.v)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition ${quintaModo === o.v ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 bg-white/[0.02] text-slate-300'}`}>
                    <span className="block font-medium">{o.t}</span>
                    <span className="block text-[11px] text-slate-400">{o.s}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">Use "como segunda" quando houver problema com número.</p>
            </div>
          )}
          <button type="button" onClick={preencher} className="btn-primary w-full sm:w-auto">
            <Icon name="sparkle" className="h-4 w-4" /> Preencher pelo dia
          </button>
        </div>

        {/* Bom dia */}
        <div className="card card-pad space-y-3">
          <label className="flex items-center justify-between">
            <span className="section-title">Bom dia</span>
            <input type="checkbox" checked={bomDia.on} onChange={(e) => setBomDia((b) => ({ ...b, on: e.target.checked }))} className="h-4 w-4 accent-brand-500" />
          </label>
          {bomDia.on && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Horário</label>
                <input type="time" className="input" value={bomDia.hora} onChange={(e) => setBomDia((b) => ({ ...b, hora: e.target.value }))} />
              </div>
              <div>
                <label className="label">Variação</label>
                <ModelPicker value={bomDia.modeloId} onChange={(v) => setBomDia((b) => ({ ...b, modeloId: v }))} placeholder="Escolha…"
                  titulo="Bom dia" options={(MODELOS['bom-dia'] || []).map((m) => ({ value: m.id, label: m.label, texto: m.texto }))} />
              </div>
            </div>
          )}
        </div>

        {/* Aquecimento */}
        <div className="card card-pad space-y-3">
          <div>
            <h2 className="section-title">Aquecimento</h2>
            <p className="mt-0.5 text-xs text-slate-500">Ligue os horários e escolha a variação de cada um.</p>
          </div>
          <div className="space-y-2.5">
            {PASTAS_AQUECIMENTO.map((p) => {
              const st = aquec[p.id];
              const opts = modelosDaPasta(p.id);
              const temModelos = opts.length > 0;
              return (
                <div key={p.id} className={`rounded-xl border transition ${st.on ? 'border-brand-400/40 bg-brand-500/[0.08]' : 'border-white/10 bg-white/[0.02]'}`}>
                  <button
                    type="button"
                    disabled={!temModelos}
                    onClick={() => setPasta(p.id, { on: !st.on })}
                    className="flex w-full items-center gap-3 p-3 text-left active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border transition ${st.on ? 'border-brand-400 bg-brand-500 text-white' : 'border-white/20 text-transparent'}`}>
                      <Icon name="check" className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 text-sm font-medium text-slate-100">{p.label}</span>
                    <span className="text-xs tabular-nums text-slate-500">{st.hora}</span>
                  </button>
                  {st.on && temModelos && (
                    <div className="px-3 pb-3">
                      <ModelPicker value={st.modeloId} onChange={(v) => setPasta(p.id, { modeloId: v })} placeholder="Escolha a variação…"
                        titulo={`Aquecimento ${p.label}`} options={opts.map((m, idx) => ({ value: m.id, label: `Variação ${idx + 1}`, texto: m.texto }))} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pedidos */}
        <div className="card card-pad space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Pedidos</h2>
            <button type="button" onClick={addPedido} className="btn-ghost px-2.5 py-1.5 text-xs">
              <Icon name="plus" className="h-3.5 w-3.5" /> Pedido
            </button>
          </div>
          {pedidos.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum pedido.</p>
          ) : (
            <div className="space-y-3">
              {pedidos.map((pd, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Pedido {i + 1}</span>
                    <button type="button" onClick={() => delPedido(i)} className="link-quiet p-1"><Icon name="trash" className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Horário</label>
                      <input type="time" className="input" value={pd.hora} onChange={(e) => setPedido(i, { hora: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Modelo</label>
                      <ModelPicker value={pd.modeloId} onChange={(v) => setPedido(i, { modeloId: v })} placeholder="Texto…"
                        titulo="Pedido" options={MODELOS.pedido.map((m, idx) => ({ value: m.id, label: `Variação ${idx + 1}`, texto: m.texto }))} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Campanhas</label>
                    <div className="flex flex-wrap gap-1.5">
                      {CAMPANHAS.map((c) => {
                        const on = pd.campanhas.includes(c.nome);
                        return (
                          <button key={c.nome} type="button" onClick={() => toggleCampPedido(i, c.nome)}
                            className={`rounded-lg border px-2.5 py-1 text-xs transition ${on ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 bg-white/[0.02] text-slate-400'}`}>
                            {c.nome}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Entradas */}
        <div className="card card-pad space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="section-title">Entradas</h2>
              <p className="mt-0.5 text-xs text-slate-500">Texto pronto — depois você sobe a imagem e os links.</p>
            </div>
            <button type="button" onClick={addEntrada} className="btn-ghost px-2.5 py-1.5 text-xs">
              <Icon name="plus" className="h-3.5 w-3.5" /> Entrada
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label">Link do dia (principal)</label>
              <input className="input" value={linkDia.principal} onChange={(e) => setLinkDia((l) => ({ ...l, principal: e.target.value }))} placeholder="https://… (ATIVOS 1 e 2)" />
            </div>
            <div>
              <label className="label">Link 2 (só ATIVOS 1)</label>
              <input className="input" value={linkDia.dois} onChange={(e) => setLinkDia((l) => ({ ...l, dois: e.target.value }))} placeholder="https://… (2ª mensagem)" />
            </div>
          </div>

          {entradas.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma entrada.</p>
          ) : (
            <div className="space-y-3">
              {entradas.map((e, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Entrada {i + 1}</span>
                    <button type="button" onClick={() => delEntrada(i)} className="link-quiet p-1"><Icon name="trash" className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Horário</label>
                      <input type="time" className="input" value={e.hora} onChange={(ev) => setEntrada(i, { hora: ev.target.value })} />
                    </div>
                    <div>
                      <label className="label">Slot</label>
                      <Select value={e.slot} onChange={(v) => escolherSlot(i, e, v)} placeholder="Fortune…" options={SLOTS} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Variação ({String(e.hora || '').replace(':', 'h')})</label>
                    <ModelPicker value={e.modeloId} onChange={(v) => escolherVariacao(i, e, v)} placeholder="Escolha a variação…"
                      titulo={`Entrada ${String(e.hora || '').replace(':', 'h')}`}
                      options={modelosDaEntrada(e.hora).map((m, idx) => ({
                        value: m.id,
                        label: `Variação ${idx + 1} — ${String(e.hora || '').replace(':', 'h')}`,
                        texto: aplicarSlot(m.texto, e.slot),
                      }))} />
                  </div>
                  <div>
                    <label className="label">Texto (editável)</label>
                    <textarea className="input min-h-[120px] resize-y font-mono text-[13px] leading-snug"
                      value={e.texto || ''} onChange={(ev) => setEntrada(i, { texto: ev.target.value })}
                      placeholder="Escolha uma variação acima ou digite o texto. Use {link} onde o link do dia entra." />
                    <p className="mt-1 text-[11px] text-slate-500">O <code>{'{link}'}</code> é trocado pelo link do dia no agendamento.</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Feedbacks — 1 demanda por grupo, com vários espaços dentro */}
        <div className="card card-pad space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="section-title">Feedbacks</h2>
              <p className="mt-0.5 text-xs text-slate-500">Cada grupo é uma demanda só, com os espaços já nomeados. Giselle sobe a mídia em cada espaço; você agenda.</p>
            </div>
            <button type="button" onClick={preencherFeedbacks} className="btn-ghost flex-none whitespace-nowrap px-2.5 py-1.5 text-xs">
              <Icon name="sparkle" className="h-3.5 w-3.5" /> Preencher feedbacks
            </button>
          </div>

          <div>
            <label className="label">Responsável pelos feedbacks</label>
            <Select value={feedbackResp} onChange={setFeedbackResp} placeholder="Selecione (ex.: Giselle)…"
              options={operadores.map((u) => ({ value: u.id, label: `${u.nome} (${u.role})` }))} />
          </div>

          {feedbacks.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum feedback. Toque em “Preencher pelo dia”.</p>
          ) : (
            <>
              <div className="space-y-2">
                {feedbacks.map((g, i) => {
                  const midia = g.slots.filter((s) => s.tipo === 'midia').length;
                  const texto = g.slots.length - midia;
                  return (
                    <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-100">{g.titulo}</p>
                          <p className="text-[11px] text-slate-500">
                            {g.slots.length} espaço(s){midia ? ` · ${midia} mídia` : ''}{texto ? ` · ${texto} texto` : ''} · {g.slots.map((s) => s.horario).join(', ')}
                          </p>
                        </div>
                        <button type="button" onClick={() => delGrupo(i)} className="link-quiet flex-none p-1"><Icon name="trash" className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {['AQUECIMENTO', 'ATIVOS 1', 'ATIVOS 2'].map((nome) => {
                          const on = (g.campanhas || []).includes(nome);
                          return (
                            <button key={nome} type="button" onClick={() => toggleCampFeedback(i, nome)}
                              className={`rounded-lg border px-2.5 py-1 text-xs transition ${on ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 bg-white/[0.02] text-slate-400'}`}>
                              {nome}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!feedbackResp && (
                <p className="text-[11px] text-amber-300/80">Escolha o responsável para incluir os feedbacks no dia.</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pb-2">
          <span className="text-sm text-slate-400">{specs.length} demanda(s) no dia</span>
          <button onClick={onSubmit} disabled={enviando || specs.length === 0} className="btn-primary">
            {enviando ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}
            Criar {specs.length} demanda(s)
          </button>
        </div>
      </div>
    </div>
  );
}
