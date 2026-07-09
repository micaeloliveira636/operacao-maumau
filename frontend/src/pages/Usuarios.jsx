import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { LoadingScreen, Modal, Spinner, Avatar } from '../components/ui';
import { Icon } from '../components/Icon';

const VAZIO = { nome: '', email: '', senha: '', whatsapp: '', role: 'operador' };

export default function Usuarios() {
  const toast = useToast();
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(null); // {novo} | usuario
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const data = await api.get('/usuarios');
      setUsuarios(data.usuarios || []);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      if (modal.novo) {
        const { usuario } = await api.post('/usuarios', {
          nome: modal.nome, email: modal.email, senha: modal.senha,
          whatsapp: modal.whatsapp, role: modal.role,
        });
        setUsuarios((u) => [...u, usuario]);
        toast.sucesso('Usuário criado');
      } else {
        const body = { nome: modal.nome, whatsapp: modal.whatsapp, role: modal.role, ativo: modal.ativo };
        if (modal.senha) body.senha = modal.senha;
        const { usuario } = await api.patch(`/usuarios/${modal.id}`, body);
        setUsuarios((u) => u.map((x) => (x.id === usuario.id ? usuario : x)));
        toast.sucesso('Usuário atualizado');
      }
      setModal(null);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAtivo(u) {
    try {
      const { usuario } = await api.patch(`/usuarios/${u.id}`, { ativo: !u.ativo });
      setUsuarios((arr) => arr.map((x) => (x.id === usuario.id ? usuario : x)));
    } catch (err) {
      toast.erro(err.message);
    }
  }

  if (carregando) return <LoadingScreen label="Carregando equipe" />;

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">Equipe</h1>
          <p className="mt-1 text-sm text-slate-500">{usuarios.length} usuário(s)</p>
        </div>
        <button onClick={() => setModal({ novo: true, ...VAZIO })} className="btn-primary">
          <Icon name="plus" className="h-4 w-4" /> Novo
        </button>
      </div>

      <div className="space-y-2">
        {usuarios.map((u, i) => (
          <div key={u.id} style={{ animationDelay: `${Math.min(i, 12) * 0.05}s` }} className="card animate-card flex items-center gap-3 p-3.5">
            <Avatar nome={u.nome} role={u.role} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-slate-100">{u.nome}</p>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                  u.role === 'admin' ? 'bg-brand-500/15 text-brand-200' : 'bg-white/[0.05] text-slate-400'
                }`}>{u.role}</span>
                {!u.ativo && <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300">inativo</span>}
              </div>
              <p className="truncate text-xs text-slate-500">{u.email} · {u.whatsapp}</p>
            </div>
            <button onClick={() => toggleAtivo(u)} className="rounded-md p-2 text-slate-400 hover:bg-white/5" title={u.ativo ? 'Desativar' : 'Ativar'}>
              <Icon name={u.ativo ? 'eye' : 'x'} className="h-4 w-4" />
            </button>
            <button onClick={() => setModal({ ...u, senha: '' })} className="rounded-md p-2 text-slate-400 hover:bg-white/5" title="Editar">
              <Icon name="edit" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} titulo={modal?.novo ? 'Novo usuário' : 'Editar usuário'}>
        {modal && (
          <form onSubmit={salvar} className="space-y-4">
            <div>
              <label className="label">Nome</label>
              <input className="input" value={modal.nome} onChange={(e) => setModal({ ...modal, nome: e.target.value })} required />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input disabled:opacity-60" value={modal.email}
                onChange={(e) => setModal({ ...modal, email: e.target.value })}
                disabled={!modal.novo} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">WhatsApp</label>
                <input className="input" value={modal.whatsapp} placeholder="+5511999999999"
                  onChange={(e) => setModal({ ...modal, whatsapp: e.target.value })} required />
              </div>
              <div>
                <label className="label">Papel</label>
                <select className="input" value={modal.role} onChange={(e) => setModal({ ...modal, role: e.target.value })}>
                  <option value="operador">Operador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">{modal.novo ? 'Senha' : 'Nova senha (opcional)'}</label>
              <input type="password" className="input" value={modal.senha || ''}
                onChange={(e) => setModal({ ...modal, senha: e.target.value })}
                required={modal.novo} placeholder={modal.novo ? '' : 'Deixe em branco para manter'} />
            </div>
            {!modal.novo && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={!!modal.ativo} onChange={(e) => setModal({ ...modal, ativo: e.target.checked })} className="h-4 w-4 accent-brand-500" />
                Usuário ativo
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className="btn-ghost">Cancelar</button>
              <button type="submit" disabled={salvando} className="btn-primary">
                {salvando ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} Salvar
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
