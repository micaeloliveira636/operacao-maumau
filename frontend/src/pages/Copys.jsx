import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { LoadingScreen, EmptyState, Modal, Spinner, ConfirmDialog } from '../components/ui';
import { Icon } from '../components/Icon';

export default function Copys() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [folders, setFolders] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(null); // { nome, descricao }
  const [salvando, setSalvando] = useState(false);
  const [aExcluir, setAExcluir] = useState(null);

  async function carregar() {
    try {
      const data = await api.get('/copys/folders');
      setFolders(data.folders || []);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  async function criar(e) {
    e.preventDefault();
    if (!criando.nome?.trim()) return toast.erro('Dê um nome à pasta');
    setSalvando(true);
    try {
      const { folder } = await api.post('/copys/folders', { nome: criando.nome.trim(), descricao: criando.descricao || null });
      setFolders((f) => [folder, ...f]);
      setCriando(null);
      toast.sucesso('Pasta criada');
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function deletar(folder) {
    try {
      await api.del(`/copys/folders/${folder.id}`);
      setFolders((f) => f.filter((x) => x.id !== folder.id));
      setAExcluir(null);
      toast.sucesso('Pasta excluída');
    } catch (err) {
      toast.erro(err.message);
    }
  }

  if (carregando) return <LoadingScreen label="Carregando copys" />;

  return (
    <div className="page max-w-4xl animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Copys</h1>
          <p className="page-sub">{folders.length} pasta(s) de copy</p>
        </div>
        {isAdmin && (
          <button onClick={() => setCriando({ nome: '', descricao: '' })} className="btn-primary">
            <Icon name="plus" className="h-4 w-4" /> Nova pasta
          </button>
        )}
      </div>

      {folders.length === 0 ? (
        <EmptyState icon="copy" titulo="Nenhuma pasta"
          descricao="Crie uma pasta (ex.: 'Abertura de grupo') e adicione as mensagens em sequência." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f, i) => (
            <div key={f.id} style={{ animationDelay: `${Math.min(i, 12) * 0.05}s` }}
              className="card card-lift animate-card group relative cursor-pointer p-4"
              onClick={() => navigate(`/copys/${f.id}`)}>
              <div className="flex items-start gap-3">
                <div className="relative flex-none">
                  <Icon name="copy" className="h-8 w-8 text-amber-300/90" />
                  <span className="absolute -right-2 -top-2 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-ink-950">
                    {f.totalMensagens}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-100">{f.nome}</p>
                  <p className="text-[11px] text-slate-500">{f.totalMensagens} mensagem(ns)</p>
                </div>
                <Icon name="chevronRight" className="h-4 w-4 flex-none text-slate-600 group-hover:text-brand-300" />
              </div>
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); setAExcluir(f); }}
                  title="Excluir pasta"
                  className="absolute bottom-2 right-2 rounded-lg border border-white/10 bg-ink-900/80 p-1.5 text-slate-400 opacity-0 transition hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-300 group-hover:opacity-100"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!criando} onClose={() => setCriando(null)} titulo="Nova pasta de copy" maxWidth="max-w-md">
        {criando && (
          <form onSubmit={criar} className="space-y-4">
            <div>
              <label className="label">Nome da pasta</label>
              <input className="input" autoFocus placeholder="Ex.: Abertura de grupo"
                value={criando.nome} onChange={(e) => setCriando({ ...criando, nome: e.target.value })} required />
            </div>
            <div>
              <label className="label">Descrição (opcional)</label>
              <input className="input" value={criando.descricao}
                onChange={(e) => setCriando({ ...criando, descricao: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCriando(null)} className="btn-ghost">Cancelar</button>
              <button type="submit" disabled={salvando} className="btn-primary">
                {salvando ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} Criar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!aExcluir}
        titulo="Excluir pasta"
        mensagem={aExcluir ? `Excluir "${aExcluir.nome}" e todas as suas mensagens?` : ''}
        confirmLabel="Excluir"
        perigo
        onConfirmar={() => aExcluir && deletar(aExcluir)}
        onCancelar={() => setAExcluir(null)}
      />
    </div>
  );
}
