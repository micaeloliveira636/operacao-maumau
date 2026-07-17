import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { uploadCopyMedia } from '../lib/upload';
import { useToast } from '../context/ToastContext';
import { CAMPANHAS } from '../lib/constants';
import { LoadingScreen, Modal, Spinner, Select, ConfirmDialog } from '../components/ui';
import { Icon } from '../components/Icon';

const ICONE_TIPO = { text: 'edit', image: 'image', video: 'video', audio: 'file' };
const LABEL_TIPO = { text: 'Texto', image: 'Imagem', video: 'Vídeo', audio: 'Áudio' };
const hojeISO = () => new Date().toLocaleDateString('en-CA');

export default function CopyFolder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [folder, setFolder] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novoTexto, setNovoTexto] = useState('');
  const [subindo, setSubindo] = useState(false);
  const [enviarOpen, setEnviarOpen] = useState(false);
  const [aExcluir, setAExcluir] = useState(null);

  async function carregar() {
    try {
      const data = await api.get(`/copys/folders/${id}`);
      setFolder(data.folder);
      setMensagens(data.mensagens || []);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, [id]);

  async function addTexto() {
    if (!novoTexto.trim()) return;
    try {
      const { mensagem } = await api.post(`/copys/folders/${id}/mensagens`, { tipo: 'text', texto: novoTexto, offsetMin: mensagens.length ? 1 : 0 });
      setMensagens((m) => [...m, mensagem]);
      setNovoTexto('');
    } catch (err) { toast.erro(err.message); }
  }

  async function addMidia(file) {
    if (!file) return;
    setSubindo(true);
    try {
      const { tipo, publicId, format } = await uploadCopyMedia({ folderId: id, file });
      const { mensagem } = await api.post(`/copys/folders/${id}/mensagens`, { tipo, publicId, format, offsetMin: mensagens.length ? 1 : 0 });
      setMensagens((m) => [...m, mensagem]);
    } catch (err) {
      toast.erro(err.message || 'Falha no upload');
    } finally {
      setSubindo(false);
    }
  }

  async function salvarMsg(msgId, patch) {
    setMensagens((m) => m.map((x) => (x.id === msgId ? { ...x, ...patch } : x)));
    try { await api.patch(`/copys/mensagens/${msgId}`, patch); }
    catch (err) { toast.erro(err.message); }
  }

  async function deletarMsg(msg) {
    try {
      await api.del(`/copys/mensagens/${msg.id}`);
      setMensagens((m) => m.filter((x) => x.id !== msg.id));
      setAExcluir(null);
    } catch (err) { toast.erro(err.message); }
  }

  if (carregando) return <LoadingScreen label="Carregando pasta" />;
  if (!folder) return null;

  return (
    <div className="page max-w-3xl animate-fade-up">
      <button onClick={() => navigate('/copys')} className="link-quiet mb-4 inline-flex items-center gap-1.5 text-sm">
        <Icon name="arrowLeft" className="h-4 w-4" /> Voltar
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{folder.nome}</h1>
          <p className="page-sub">{mensagens.length} mensagem(ns) em sequência</p>
        </div>
        <button onClick={() => setEnviarOpen(true)} disabled={mensagens.length === 0} className="btn-primary">
          <Icon name="send" className="h-4 w-4" /> Enviar copy
        </button>
      </div>

      {/* Sequência de mensagens */}
      <div className="space-y-2">
        {mensagens.map((m, i) => (
          <div key={m.id}>
            {i > 0 && (
              <div className="flex items-center gap-2 py-1 pl-3 text-[11px] text-slate-500">
                <Icon name="clock" className="h-3.5 w-3.5" />
                enviar
                <input type="number" min="0" value={m.offsetMin}
                  onChange={(e) => salvarMsg(m.id, { offsetMin: Math.max(0, Number(e.target.value)) })}
                  className="w-14 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-center text-xs text-slate-200" />
                min depois da anterior
              </div>
            )}
            <div className="card card-pad">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Icon name={ICONE_TIPO[m.tipo] || 'file'} className="h-3.5 w-3.5" /> {i + 1}. {LABEL_TIPO[m.tipo] || m.tipo}
                </span>
                <button onClick={() => setAExcluir(m)} className="link-quiet p-1"><Icon name="trash" className="h-4 w-4" /></button>
              </div>
              {m.tipo === 'text' ? (
                <textarea className="input min-h-[60px] resize-y text-sm" value={m.texto || ''}
                  onChange={(e) => setMensagens((ms) => ms.map((x) => (x.id === m.id ? { ...x, texto: e.target.value } : x)))}
                  onBlur={(e) => salvarMsg(m.id, { texto: e.target.value })} />
              ) : (
                <div className="space-y-2">
                  {m.tipo === 'image' && <img src={m.url} alt="" className="mx-auto max-h-80 w-full rounded-lg bg-ink-950 object-contain" />}
                  {m.tipo === 'video' && (
                    <video src={m.url} poster={String(m.url).replace(/\.mp4($|\?)/, '.jpg$1')}
                      controls playsInline preload="metadata"
                      className="mx-auto max-h-80 w-full rounded-lg bg-ink-950 object-contain" />
                  )}
                  {m.tipo === 'audio' && <audio src={m.url} controls className="w-full" />}
                  {m.tipo !== 'audio' && (
                    <textarea className="input min-h-[44px] resize-y text-sm" placeholder="Legenda (opcional)" value={m.texto || ''}
                      onChange={(e) => setMensagens((ms) => ms.map((x) => (x.id === m.id ? { ...x, texto: e.target.value } : x)))}
                      onBlur={(e) => salvarMsg(m.id, { texto: e.target.value })} />
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {mensagens.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/[0.06] py-8 text-center text-xs text-slate-600">
            Sem mensagens ainda. Adicione abaixo, na ordem de envio.
          </p>
        )}
      </div>

      {/* Adicionar */}
      <div className="card card-pad space-y-3">
        <h2 className="section-title">Adicionar mensagem</h2>
        <textarea className="input min-h-[60px] resize-y text-sm" placeholder="Texto da mensagem…"
          value={novoTexto} onChange={(e) => setNovoTexto(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button onClick={addTexto} disabled={!novoTexto.trim()} className="btn-ghost text-xs">
            <Icon name="plus" className="h-3.5 w-3.5" /> Adicionar texto
          </button>
          <label className={`btn-ghost cursor-pointer text-xs ${subindo ? 'opacity-60' : ''}`}>
            {subindo ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="upload" className="h-3.5 w-3.5" />}
            {subindo ? 'Enviando…' : 'Adicionar mídia (img/vídeo/áudio)'}
            <input type="file" accept="image/*,video/*,audio/*" className="hidden" disabled={subindo}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; addMidia(f); }} />
          </label>
        </div>
        <p className="text-[11px] text-slate-500">A 1ª mensagem sai na hora de início; as próximas seguem o “X min depois da anterior”.</p>
      </div>

      {enviarOpen && (
        <EnviarCopyDialog folderId={id} mensagens={mensagens} onClose={() => setEnviarOpen(false)} toast={toast} />
      )}

      <ConfirmDialog
        open={!!aExcluir}
        titulo="Excluir mensagem"
        mensagem="Remover esta mensagem da sequência?"
        confirmLabel="Excluir"
        perigo
        onConfirmar={() => aExcluir && deletarMsg(aExcluir)}
        onCancelar={() => setAExcluir(null)}
      />
    </div>
  );
}

function EnviarCopyDialog({ folderId, mensagens, onClose, toast }) {
  const [releaseId, setReleaseId] = useState(CAMPANHAS.find((c) => c.nome === 'AQUECIMENTO')?.releaseId || CAMPANHAS[0].releaseId);
  const [grupos, setGrupos] = useState(null);
  const [grupoId, setGrupoId] = useState('');
  const [carregandoGrupos, setCarregandoGrupos] = useState(false);
  const [data, setData] = useState(hojeISO());
  const [hora, setHora] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cacheGrupos = useRef({}); // releaseId -> grupos (evita refetch ao trocar campanha)

  useEffect(() => {
    let vivo = true;
    setGrupoId('');
    // Já buscado nesta sessão do diálogo? usa o cache, sem nova chamada à API.
    if (cacheGrupos.current[releaseId]) {
      setGrupos(cacheGrupos.current[releaseId]);
      setCarregandoGrupos(false);
      return () => { vivo = false; };
    }
    setGrupos(null); setCarregandoGrupos(true);
    api.get(`/copys/grupos?releaseId=${encodeURIComponent(releaseId)}`)
      .then((d) => { if (vivo) { cacheGrupos.current[releaseId] = d.grupos || []; setGrupos(d.grupos || []); } })
      .catch((e) => { if (vivo) { setGrupos([]); toast.erro(e.message || 'Falha ao buscar grupos'); } })
      .finally(() => { if (vivo) setCarregandoGrupos(false); });
    return () => { vivo = false; };
  }, [releaseId]);

  // Prévia da cascata (client-side, só pra visualizar os horários).
  const previa = useMemo(() => {
    if (!hora) return [];
    let t = new Date(`${data}T${hora}:00-03:00`).getTime();
    if (!Number.isFinite(t)) return [];
    return mensagens.map((m, i) => {
      if (i > 0) t += (m.offsetMin || 0) * 60000;
      const d = new Date(t);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return { ordem: i + 1, tipo: m.tipo, hora: `${hh}:${mm}` };
    });
  }, [mensagens, data, hora]);

  async function enviar() {
    if (!grupoId) return toast.erro('Escolha o grupo');
    if (!hora) return toast.erro('Escolha a hora de início');
    setEnviando(true);
    try {
      const r = await api.post(`/copys/folders/${folderId}/enviar`, { releaseId, grupoId, data, hora });
      if (r.ok) toast.sucesso(`${r.agendadas} mensagem(ns) agendada(s)!`);
      else toast.erro((r.erros || []).slice(0, 1).join('') || 'Falha ao agendar');
      if (r.agendadas > 0) onClose();
    } catch (err) {
      toast.erro(err.message || 'Erro ao enviar copy');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal open onClose={onClose} titulo="Enviar copy" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="label">Campanha</label>
          <Select value={releaseId} onChange={setReleaseId}
            options={CAMPANHAS.map((c) => ({ value: c.releaseId, label: c.nome }))} />
        </div>
        <div>
          <label className="label">Grupo</label>
          {carregandoGrupos ? (
            <p className="text-xs text-slate-500"><Spinner className="mr-1 inline h-3.5 w-3.5" /> buscando grupos…</p>
          ) : (
            <Select value={grupoId} onChange={setGrupoId} placeholder="Escolha o grupo…"
              options={(grupos || []).map((g) => ({ value: g.gid, label: g.name || g.gid }))} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={data} min={hojeISO()} onChange={(e) => setData(e.target.value)} />
          </div>
          <div>
            <label className="label">Hora de início</label>
            <input type="time" className="input" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>

        {previa.length > 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Prévia dos horários</p>
            <div className="space-y-0.5 text-xs text-slate-300">
              {previa.map((p) => (
                <div key={p.ordem} className="flex items-center gap-2">
                  <span className="w-10 font-mono text-brand-200">{p.hora}</span>
                  <span className="text-slate-500">#{p.ordem} · {LABEL_TIPO[p.tipo] || p.tipo}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={enviar} disabled={enviando || !grupoId || !hora} className="btn-primary">
            {enviando ? <Spinner className="h-4 w-4" /> : <Icon name="send" className="h-4 w-4" />}
            Agendar {mensagens.length} mensagem(ns)
          </button>
        </div>
      </div>
    </Modal>
  );
}
