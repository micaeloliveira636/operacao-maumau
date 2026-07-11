import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CAMPANHAS } from '../lib/constants';
import {
  PASTAS_AQUECIMENTO, modelosDaPasta, MODELOS, SLOTS, HORARIOS_ENTRADA, aplicarSlot,
} from '../lib/modelos';
import { Select, Spinner } from '../components/ui';
import { SuccessOverlay } from '../components/SuccessOverlay';
import { Icon } from '../components/Icon';

const releaseDe = (nome) => CAMPANHAS.find((c) => c.nome === nome)?.releaseId || '';
const FEEDBACKS = [
  { value: 'feedback-entrada', label: 'Feedback entrada' },
  { value: 'feedback-lara', label: 'Feedback lara' },
  { value: 'feedback-saque', label: 'Feedback saque' },
];

export default function RotinaDia() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { data: usuariosData } = useFetch('/usuarios', []);
  const operadores = (usuariosData?.usuarios || []).filter((u) => u.ativo);

  const [dataAlvo, setDataAlvo] = useState(new Date().toISOString().slice(0, 10));
  const [enviando, setEnviando] = useState(false);
  const [criadas, setCriadas] = useState(null);

  // Aquecimento: por pasta -> { on, modeloId, hora }
  const [aquec, setAquec] = useState(() =>
    Object.fromEntries(PASTAS_AQUECIMENTO.map((p) => [p.id, { on: false, modeloId: '', hora: p.hora }]))
  );
  const setPasta = (id, patch) => setAquec((a) => ({ ...a, [id]: { ...a[id], ...patch } }));

  // Entradas: lista de { hora, slot, modeloId }
  const [entradas, setEntradas] = useState([]);
  const addEntrada = () =>
    setEntradas((e) => [...e, { hora: HORARIOS_ENTRADA[e.length] || '', slot: SLOTS[0], modeloId: '' }]);
  const setEntrada = (i, patch) => setEntradas((e) => e.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const delEntrada = (i) => setEntradas((e) => e.filter((_, idx) => idx !== i));

  // Feedbacks: lista de { categoria, hora, atribuidoA }
  const [feedbacks, setFeedbacks] = useState([]);
  const addFeedback = () =>
    setFeedbacks((f) => [...f, { categoria: 'feedback-entrada', hora: '', atribuidoA: '' }]);
  const setFeedback = (i, patch) => setFeedbacks((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const delFeedback = (i) => setFeedbacks((f) => f.filter((_, idx) => idx !== i));

  const specs = useMemo(() => {
    const out = [];
    // Aquecimento (auto-gerido — atribuído ao próprio admin)
    for (const p of PASTAS_AQUECIMENTO) {
      const st = aquec[p.id];
      if (!st?.on || !st.modeloId) continue;
      const m = modelosDaPasta(p.id).find((x) => x.id === st.modeloId);
      if (!m) continue;
      out.push({
        titulo: `Aquecimento ${p.label}`,
        categoria: 'aquecimento',
        dataAlvo,
        horarios: [st.hora || p.hora],
        legenda: m.texto,
        campanhasDestino: ['AQUECIMENTO'],
        releaseIds: [releaseDe('AQUECIMENTO')],
        atribuidoA: user?.id,
        velocidade: 'slow',
      });
    }
    // Entradas
    for (const e of entradas) {
      if (!e.hora || !e.modeloId) continue;
      const m = MODELOS.entrada.find((x) => x.id === e.modeloId);
      out.push({
        titulo: `Entrada ${e.hora} — ${e.slot}`,
        categoria: 'entrada',
        dataAlvo,
        horarios: [e.hora],
        legenda: m ? aplicarSlot(m.texto, e.slot) : '',
        campanhasDestino: ['ATIVOS 1', 'ATIVOS 2'],
        releaseIds: [releaseDe('ATIVOS 1'), releaseDe('ATIVOS 2')],
        atribuidoA: user?.id,
        velocidade: 'normal',
      });
    }
    // Feedbacks (atribuídos a um operador)
    for (const f of feedbacks) {
      if (!f.hora || !f.atribuidoA) continue;
      const label = FEEDBACKS.find((x) => x.value === f.categoria)?.label || 'Feedback';
      out.push({
        titulo: `${label} ${f.hora}`,
        categoria: f.categoria,
        dataAlvo,
        horarios: [f.hora],
        campanhasDestino: ['ATIVOS 1', 'ATIVOS 2'],
        releaseIds: [releaseDe('ATIVOS 1'), releaseDe('ATIVOS 2')],
        atribuidoA: f.atribuidoA,
        velocidade: 'slow',
      });
    }
    return out;
  }, [aquec, entradas, feedbacks, dataAlvo, user]);

  async function onSubmit() {
    if (specs.length === 0) return toast.erro('Monte ao menos uma demanda para o dia');
    setEnviando(true);
    try {
      const { demandas } = await api.post('/demandas/rotina', { demandas: specs });
      setCriadas(demandas?.length || specs.length);
    } catch (err) {
      toast.erro(err.message || 'Erro ao montar o dia');
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      {criadas != null && (
        <SuccessOverlay message={`${criadas} demanda(s) criadas`} onDone={() => navigate('/board')} />
      )}
      <button onClick={() => navigate(-1)} className="link-quiet mb-4 inline-flex items-center gap-1.5 text-sm">
        <Icon name="arrowLeft" className="h-4 w-4" /> Voltar
      </button>
      <h1 className="page-title">Montar o dia</h1>
      <p className="page-sub">Defina os aquecimentos, entradas e feedbacks do dia de uma vez. Depois é só subir as mídias.</p>

      <div className="mt-5 space-y-4 sm:space-y-5">
        <div className="card card-pad">
          <label className="label">Data do dia</label>
          <input type="date" className="input sm:max-w-xs" value={dataAlvo} onChange={(e) => setDataAlvo(e.target.value)} />
        </div>

        {/* Aquecimento */}
        <div className="card card-pad space-y-3">
          <div>
            <h2 className="section-title">Aquecimento</h2>
            <p className="mt-0.5 text-xs text-slate-500">Ligue os horários do dia e escolha a variação de cada um.</p>
          </div>
          <div className="space-y-2.5">
            {PASTAS_AQUECIMENTO.map((p) => {
              const st = aquec[p.id];
              const opts = modelosDaPasta(p.id);
              const temModelos = opts.length > 0;
              return (
                <div key={p.id} className={`rounded-xl border p-3 transition ${st.on ? 'border-brand-400/40 bg-brand-500/[0.06]' : 'border-white/10 bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2.5">
                      <input type="checkbox" checked={st.on} disabled={!temModelos}
                        onChange={(e) => setPasta(p.id, { on: e.target.checked })} className="h-4 w-4 accent-brand-500" />
                      <span className="text-sm font-medium text-slate-100">{p.label}</span>
                      {!temModelos && <span className="text-[11px] text-slate-500">(sem textos ainda)</span>}
                    </label>
                    <span className="text-xs tabular-nums text-slate-500">{st.hora}</span>
                  </div>
                  {st.on && temModelos && (
                    <div className="mt-2.5">
                      <Select
                        value={st.modeloId}
                        onChange={(v) => setPasta(p.id, { modeloId: v })}
                        placeholder="Escolha a variação…"
                        options={opts.map((m) => ({ value: m.id, label: m.label.replace(/^\S+\s—\s/, '') }))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
          {entradas.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma entrada. Toque em “Entrada” para adicionar.</p>
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
                      <Select value={e.slot} onChange={(v) => setEntrada(i, { slot: v })} options={SLOTS} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Modelo</label>
                    <Select value={e.modeloId} onChange={(v) => setEntrada(i, { modeloId: v })} placeholder="Escolha o texto…"
                      options={MODELOS.entrada.map((m) => ({ value: m.id, label: m.label }))} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Feedbacks */}
        <div className="card card-pad space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="section-title">Feedbacks</h2>
              <p className="mt-0.5 text-xs text-slate-500">Atribua a quem vai subir a mídia (ex.: Giselle).</p>
            </div>
            <button type="button" onClick={addFeedback} className="btn-ghost px-2.5 py-1.5 text-xs">
              <Icon name="plus" className="h-3.5 w-3.5" /> Feedback
            </button>
          </div>
          {feedbacks.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum feedback.</p>
          ) : (
            <div className="space-y-3">
              {feedbacks.map((f, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Feedback {i + 1}</span>
                    <button type="button" onClick={() => delFeedback(i)} className="link-quiet p-1"><Icon name="trash" className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Tipo</label>
                      <Select value={f.categoria} onChange={(v) => setFeedback(i, { categoria: v })}
                        options={FEEDBACKS.map((x) => ({ value: x.value, label: x.label }))} />
                    </div>
                    <div>
                      <label className="label">Horário</label>
                      <input type="time" className="input" value={f.hora} onChange={(ev) => setFeedback(i, { hora: ev.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Responsável</label>
                    <Select value={f.atribuidoA} onChange={(v) => setFeedback(i, { atribuidoA: v })} placeholder="Selecione…"
                      options={operadores.map((u) => ({ value: u.id, label: `${u.nome} (${u.role})` }))} />
                  </div>
                </div>
              ))}
            </div>
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
