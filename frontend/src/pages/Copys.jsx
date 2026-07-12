import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { LoadingScreen, EmptyState, Modal, Spinner, Select, ConfirmDialog } from '../components/ui';
import { Icon } from '../components/Icon';

const TIPOS = [
  { value: '', label: 'Sem tipo' },
  { value: 'sistema', label: 'Sistema' },
  { value: 'anuncio', label: 'Anúncio' },
  { value: 'parceria', label: 'Parceria' },
];

export default function Copys() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [copys, setCopys] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(null); // objeto ou {novo:true}
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const data = await api.get('/copys');
      setCopys(data.copys || []);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.sucesso('Copiado');
    } catch {
      toast.erro('Não foi possível copiar');
    }
  }

  async function salvar(e) {
    e.preventDefault();
    if (!editando.nome?.trim() || !editando.conteudo?.trim())
      return toast.erro('Nome e conteúdo são obrigatórios');
    setSalvando(true);
    try {
      const body = {
        nome: editando.nome.trim(),
        conteudo: editando.conteudo,
        tipo: editando.tipo || null,
        ordem: editando.ordem ?? 0,
        ativo: editando.ativo ?? false,
      };
      if (editando.novo) {
        const { copy } = await api.post('/copys', body);
        setCopys((c) => [copy, ...c]);
        toast.sucesso('Copy criada');
      } else {
        const { copy } = await api.patch(`/copys/${editando.id}`, body);
        setCopys((c) => c.map((x) => (x.id === copy.id ? copy : x)));
        toast.sucesso('Copy atualizada');
      }
      setEditando(null);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAtivo(copy) {
    try {
      const { copy: upd } = await api.patch(`/copys/${copy.id}`, { ativo: !copy.ativo });
      setCopys((c) => c.map((x) => (x.id === upd.id ? upd : x)));
    } catch (err) {
      toast.erro(err.message);
    }
  }

  const [aExcluir, setAExcluir] = useState(null);
  async function deletar(copy) {
    try {
      await api.del(`/copys/${copy.id}`);
      setCopys((c) => c.filter((x) => x.id !== copy.id));
      toast.sucesso('Copy deletada');
      setAExcluir(null);
    } catch (err) {
      toast.erro(err.message);
    }
  }

  if (carregando) return <LoadingScreen label="Carregando copys" />;

  return (
    <div className="page max-w-4xl animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Copys de lançamento</h1>
          <p className="page-sub">{copys.length} copy(s) salvas</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setEditando({ novo: true, nome: '', conteudo: '', tipo: '', ordem: 0, ativo: false })}
            className="btn-primary"
          >
            <Icon name="plus" className="h-4 w-4" /> Nova copy
          </button>
        )}
      </div>

      {copys.length === 0 ? (
        <EmptyState icon="copy" titulo="Nenhuma copy" descricao="Cadastre textos reutilizáveis de lançamento." />
      ) : (
        <div className="space-y-3">
          {copys.map((copy, i) => (
            <div key={copy.id} style={{ animationDelay: `${Math.min(i, 12) * 0.05}s` }} className="card animate-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-slate-100">{copy.nome}</h3>
                  {copy.tipo && (
                    <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                      {copy.tipo}
                    </span>
                  )}
                  {copy.ativo && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      ativa
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => copiar(copy.conteudo)} className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-100" title="Copiar">
                    <Icon name="clipboard" className="h-4 w-4" />
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => toggleAtivo(copy)} className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-emerald-300" title="Ativar/Desativar">
                        <Icon name={copy.ativo ? 'eye' : 'sparkle'} className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditando(copy)} className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-100" title="Editar">
                        <Icon name="edit" className="h-4 w-4" />
                      </button>
                      <button onClick={() => setAExcluir(copy)} className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-rose-300" title="Deletar">
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-ink-950/60 p-3 text-sm text-slate-300">
                {copy.conteudo}
              </pre>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editando} onClose={() => setEditando(null)} titulo={editando?.novo ? 'Nova copy' : 'Editar copy'} maxWidth="max-w-xl">
        {editando && (
          <form onSubmit={salvar} className="space-y-4">
            <div>
              <label className="label">Nome</label>
              <input className="input" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Tipo</label>
                <Select
                  value={editando.tipo || ''}
                  onChange={(v) => setEditando({ ...editando, tipo: v })}
                  options={TIPOS.map((t) => ({ value: t.value, label: t.label }))}
                />
              </div>
              <div>
                <label className="label">Ordem</label>
                <input type="number" className="input" value={editando.ordem ?? 0} onChange={(e) => setEditando({ ...editando, ordem: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="label">Conteúdo</label>
              <textarea className="input min-h-[160px] resize-y font-mono text-sm" value={editando.conteudo}
                onChange={(e) => setEditando({ ...editando, conteudo: e.target.value })} required />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={!!editando.ativo} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} className="h-4 w-4 accent-brand-500" />
              Marcar como ativa
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditando(null)} className="btn-ghost">Cancelar</button>
              <button type="submit" disabled={salvando} className="btn-primary">
                {salvando ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} Salvar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!aExcluir}
        titulo="Excluir copy"
        mensagem={aExcluir ? `Excluir "${aExcluir.nome}"?` : ''}
        confirmLabel="Excluir"
        perigo
        onConfirmar={() => aExcluir && deletar(aExcluir)}
        onCancelar={() => setAExcluir(null)}
      />
    </div>
  );
}
