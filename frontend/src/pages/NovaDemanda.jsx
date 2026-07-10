import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useToast } from '../context/ToastContext';
import { CATEGORIAS, CAMPANHAS, VELOCIDADES, PRIORIDADES } from '../lib/constants';
import { Spinner } from '../components/ui';
import { SuccessOverlay } from '../components/SuccessOverlay';
import { Icon } from '../components/Icon';

export default function NovaDemanda() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: usuariosData } = useFetch('/usuarios', []);
  const operadores = (usuariosData?.usuarios || []).filter((u) => u.ativo);

  const [form, setForm] = useState({
    titulo: '',
    categoria: 'entrada',
    descricao: '',
    dataAlvo: new Date().toISOString().slice(0, 10),
    atribuidoA: '',
    legenda: '',
    mencionar: false,
    velocidade: 'slow',
    prioridade: 'normal',
    linkPrincipal: '',
    linkDois: '',
  });
  const [horarios, setHorarios] = useState(['']);
  const [campanhas, setCampanhas] = useState([]); // nomes selecionados
  const [enviando, setEnviando] = useState(false);
  const [criadaId, setCriadaId] = useState(null); // dispara overlay de sucesso

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function toggleCampanha(nome) {
    setCampanhas((c) => (c.includes(nome) ? c.filter((x) => x !== nome) : [...c, nome]));
  }
  function setHorario(i, v) {
    setHorarios((h) => h.map((x, idx) => (idx === i ? v : x)));
  }
  function addHorario() {
    setHorarios((h) => [...h, '']);
  }
  function removeHorario(i) {
    setHorarios((h) => (h.length === 1 ? h : h.filter((_, idx) => idx !== i)));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const horariosLimpos = horarios.map((h) => h.trim()).filter(Boolean);

    if (!form.titulo.trim()) return toast.erro('Informe um título');
    if (!form.atribuidoA) return toast.erro('Atribua a um operador');
    if (horariosLimpos.length === 0) return toast.erro('Adicione ao menos um horário');
    if (campanhas.length === 0) return toast.erro('Selecione ao menos uma campanha');

    const campanhasDestino = campanhas;
    const releaseIds = campanhas.map((nome) => CAMPANHAS.find((c) => c.nome === nome)?.releaseId || '');

    setEnviando(true);
    try {
      const { demanda } = await api.post('/demandas', {
        ...form,
        titulo: form.titulo.trim(),
        horarios: horariosLimpos,
        campanhasDestino,
        releaseIds,
      });
      setCriadaId(demanda.id); // mostra o overlay; navega no onDone
    } catch (err) {
      toast.erro(err.message || 'Erro ao criar demanda');
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      {criadaId && (
        <SuccessOverlay
          message="Demanda criada"
          onDone={() => navigate(`/demandas/${criadaId}`, { replace: true })}
        />
      )}
      <button onClick={() => navigate(-1)} className="link-quiet mb-4 inline-flex items-center gap-1.5 text-sm">
        <Icon name="arrowLeft" className="h-4 w-4" /> Voltar
      </button>
      <h1 className="page-title">Nova demanda</h1>
      <p className="page-sub">Defina o conteúdo, os horários e a quem será atribuída.</p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4 sm:space-y-5">
        <div className="card card-pad space-y-4">
          <div>
            <label className="label">Título</label>
            <input className="input" value={form.titulo} onChange={(e) => set('titulo', e.target.value)}
              placeholder="Ex.: Entrada 18h30 — Fortune Rabbit" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Categoria</label>
              <select className="input" value={form.categoria} onChange={(e) => set('categoria', e.target.value)}>
                {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Data alvo</label>
              <input type="date" className="input" value={form.dataAlvo} onChange={(e) => set('dataAlvo', e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="label">Prioridade</label>
            <div className="grid grid-cols-3 gap-2">
              {PRIORIDADES.map((p) => {
                const on = form.prioridade === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => set('prioridade', p.value)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium capitalize transition ${
                      on ? 'text-white' : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]'
                    }`}
                    style={on ? { borderColor: `${p.cor}80`, backgroundColor: `${p.cor}22`, color: p.cor } : undefined}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label">Atribuir a</label>
            <select className="input" value={form.atribuidoA} onChange={(e) => set('atribuidoA', e.target.value)} required>
              <option value="">Selecione um operador…</option>
              {operadores.map((u) => (
                <option key={u.id} value={u.id}>{u.nome} ({u.role})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Descrição / instruções</label>
            <textarea className="input min-h-[80px] resize-y" value={form.descricao}
              onChange={(e) => set('descricao', e.target.value)}
              placeholder="Orientações para o operador (opcional)" />
          </div>
        </div>

        {/* Horários */}
        <div className="card card-pad space-y-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0">Horários de envio</label>
            <button type="button" onClick={addHorario} className="btn-ghost px-2.5 py-1.5 text-xs">
              <Icon name="plus" className="h-3.5 w-3.5" /> Adicionar
            </button>
          </div>
          <p className="-mt-1 text-xs text-slate-500">A quantidade de arquivos deverá bater com a de horários.</p>
          <div className="space-y-2">
            {horarios.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="time" className="input" value={h} onChange={(e) => setHorario(i, e.target.value)} />
                {horarios.length > 1 && (
                  <button type="button" onClick={() => removeHorario(i)} className="btn-ghost px-2.5">
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Campanhas */}
        <div className="card card-pad space-y-3">
          <label className="label mb-0">Campanhas destino</label>
          <div className="grid gap-2 sm:grid-cols-3">
            {CAMPANHAS.map((c) => {
              const on = campanhas.includes(c.nome);
              return (
                <button
                  key={c.nome}
                  type="button"
                  onClick={() => toggleCampanha(c.nome)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition ${
                    on ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="font-medium">{c.nome}</span>
                  {on && <Icon name="check" className="h-4 w-4 text-brand-300" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Config de envio */}
        <div className="card card-pad grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Velocidade</label>
            <select className="input" value={form.velocidade} onChange={(e) => set('velocidade', e.target.value)}>
              {VELOCIDADES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
              <span className="text-sm text-slate-300">Mencionar todos</span>
              <input type="checkbox" checked={form.mencionar} onChange={(e) => set('mencionar', e.target.checked)}
                className="h-4 w-4 accent-brand-500" />
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Legenda padrão</label>
            <textarea className="input min-h-[70px] resize-y" value={form.legenda}
              onChange={(e) => set('legenda', e.target.value)}
              placeholder="Legenda padrão. Use {link} onde o link deve entrar (senão ele é anexado no fim)." />
          </div>
          <div>
            <label className="label">Link principal (padrão)</label>
            <input className="input" value={form.linkPrincipal} onChange={(e) => set('linkPrincipal', e.target.value)}
              placeholder="https://… (ATIVOS 1 e 2)" />
          </div>
          <div>
            <label className="label">Link 2 (só ATIVOS 1)</label>
            <input className="input" value={form.linkDois} onChange={(e) => set('linkDois', e.target.value)}
              placeholder="https://… (2ª mensagem no mesmo horário)" />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={enviando} className="btn-primary">
            {enviando ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}
            Criar demanda
          </button>
        </div>
      </form>
    </div>
  );
}
