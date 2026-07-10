import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useToast } from '../context/ToastContext';
import { CATEGORIAS, CAMPANHAS, VELOCIDADES } from '../lib/constants';
import { MODELOS, SLOTS, categoriaUsaLink, aplicarSlot } from '../lib/modelos';
import { Spinner, Select } from '../components/ui';
import { SuccessOverlay } from '../components/SuccessOverlay';
import { WhatsappPreview } from '../components/WhatsappPreview';
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
    linkPrincipal: '',
    linkDois: '',
  });
  const [horarios, setHorarios] = useState(['']);
  const [campanhas, setCampanhas] = useState([]); // nomes selecionados
  const [enviando, setEnviando] = useState(false);
  const [criadaId, setCriadaId] = useState(null); // dispara overlay de sucesso
  const [modeloId, setModeloId] = useState('');
  const [slot, setSlot] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const modelosDaCategoria = MODELOS[form.categoria] || null;
  const modeloSel = modelosDaCategoria?.find((m) => m.id === modeloId) || null;
  const usaLink = categoriaUsaLink(form.categoria);
  const dataBR = form.dataAlvo ? form.dataAlvo.split('-').reverse().join('/') : '';

  // troca de categoria: zera modelo/slot/legenda/links
  function mudarCategoria(cat) {
    setForm((f) => ({ ...f, categoria: cat, legenda: '', linkPrincipal: '', linkDois: '' }));
    setModeloId('');
    setSlot('');
  }

  // aplica o modelo escolhido (com slot) na legenda
  function aplicarModelo(id, slotAtual = slot) {
    setModeloId(id);
    const m = modelosDaCategoria?.find((x) => x.id === id);
    if (m) set('legenda', aplicarSlot(m.texto, slotAtual));
  }
  function mudarSlot(s) {
    setSlot(s);
    if (modeloSel) set('legenda', aplicarSlot(modeloSel.texto, s));
  }

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
              <Select
                value={form.categoria}
                onChange={mudarCategoria}
                options={CATEGORIAS.map((c) => ({ value: c.value, label: c.label }))}
              />
            </div>
            <div>
              <label className="label">Data do envio</label>
              <input type="date" className="input" value={form.dataAlvo} onChange={(e) => set('dataAlvo', e.target.value)} required />
              <p className="mt-1 text-[11px] text-slate-500">Os horários ficam no bloco abaixo.</p>
            </div>
          </div>

          <div>
            <label className="label">Atribuir a</label>
            <Select
              value={form.atribuidoA}
              onChange={(v) => set('atribuidoA', v)}
              placeholder="Selecione um operador…"
              options={operadores.map((u) => ({ value: u.id, label: `${u.nome} (${u.role})` }))}
            />
          </div>

          <div>
            <label className="label">Descrição / instruções</label>
            <textarea className="input min-h-[80px] resize-y" value={form.descricao}
              onChange={(e) => set('descricao', e.target.value)}
              placeholder="Orientações para o operador (opcional)" />
          </div>
        </div>

        {/* Modelo de texto (guiado pela categoria) */}
        {modelosDaCategoria && (
          <div className="card card-pad space-y-4">
            <div>
              <label className="label mb-0 capitalize">Modelo de {form.categoria.replace('-', ' ')}</label>
              <p className="mb-2 mt-0.5 text-xs text-slate-500">Escolha a variação — o texto já vem pronto.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {modelosDaCategoria.map((m) => {
                  const on = modeloId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => aplicarModelo(m.id)}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        on ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        {m.label}
                      </span>
                      {on && <Icon name="check" className="h-4 w-4 flex-none text-brand-300" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {modeloSel?.precisaSlot && (
              <div>
                <label className="label">Slot</label>
                <Select value={slot} onChange={mudarSlot} placeholder="Selecione o slot…" options={SLOTS} />
              </div>
            )}

            {form.legenda && (
              <div>
                <label className="label">Prévia (WhatsApp)</label>
                <WhatsappPreview texto={form.legenda} />
              </div>
            )}
          </div>
        )}

        {/* Horários */}
        <div className="card card-pad space-y-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0">Horários de envio</label>
            <button type="button" onClick={addHorario} className="btn-ghost px-2.5 py-1.5 text-xs">
              <Icon name="plus" className="h-3.5 w-3.5" /> Adicionar
            </button>
          </div>
          <p className="-mt-1 text-xs text-slate-500">
            Cada mídia vai ao SendFlow na data escolhida no horário abaixo. Coloque um horário por mídia
            (pode ser um horário alternativo à vontade).
          </p>
          <div className="space-y-2">
            {horarios.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="hidden shrink-0 text-xs tabular-nums text-slate-500 sm:inline">
                  {dataBR} às
                </span>
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
            <Select
              value={form.velocidade}
              onChange={(v) => set('velocidade', v)}
              options={VELOCIDADES.map((v) => ({ value: v.value, label: v.label }))}
            />
          </div>
          <div className="flex items-end">
            <label className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
              <span className="text-sm text-slate-300">Mencionar todos</span>
              <input type="checkbox" checked={form.mencionar} onChange={(e) => set('mencionar', e.target.checked)}
                className="h-4 w-4 accent-brand-500" />
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="label">{modelosDaCategoria ? 'Texto (editável)' : 'Legenda padrão'}</label>
            <textarea className="input min-h-[70px] resize-y" value={form.legenda}
              onChange={(e) => set('legenda', e.target.value)}
              placeholder="Texto da mensagem. Use {link} onde o link deve entrar (senão ele é anexado no fim)." />
          </div>
          {usaLink && (
            <>
              <div>
                <label className="label">Link principal</label>
                <input className="input" value={form.linkPrincipal} onChange={(e) => set('linkPrincipal', e.target.value)}
                  placeholder="https://… (ATIVOS 1 e 2)" />
              </div>
              <div>
                <label className="label">Link 2 (só ATIVOS 1)</label>
                <input className="input" value={form.linkDois} onChange={(e) => set('linkDois', e.target.value)}
                  placeholder="https://… (2ª mensagem no mesmo horário)" />
              </div>
            </>
          )}
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
