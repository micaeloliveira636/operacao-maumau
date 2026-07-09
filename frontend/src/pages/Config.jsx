import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ativarNotificacoes, desativarNotificacoes, estaInscrito,
  permissaoAtual, pushSuportado,
} from '../lib/push';
import { Avatar, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';

export default function Config() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [inscrito, setInscrito] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const suportado = pushSuportado();

  useEffect(() => {
    estaInscrito().then(setInscrito);
  }, []);

  async function toggle() {
    setOcupado(true);
    try {
      if (inscrito) {
        await desativarNotificacoes();
        setInscrito(false);
        toast.info('Notificações desativadas');
      } else {
        await ativarNotificacoes();
        setInscrito(true);
        toast.sucesso('Notificações ativadas');
      }
    } catch (err) {
      toast.erro(err.message || 'Falha ao alterar notificações');
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    try {
      await api.post('/notificacoes/test');
      toast.sucesso('Notificação de teste enviada');
    } catch (err) {
      toast.erro(err.message);
    }
  }

  const permissao = permissaoAtual();

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-up">
      <h1 className="text-xl font-semibold text-white sm:text-2xl">Ajustes</h1>

      {/* Perfil */}
      <div className="card flex items-center gap-4 p-5">
        <Avatar nome={user?.nome} role={user?.role} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-100">{user?.nome}</p>
          <p className="truncate text-sm text-slate-500">{user?.email}</p>
          <span className="mt-1 inline-block rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
            {user?.role}
          </span>
        </div>
      </div>

      {/* Notificações */}
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">
            <Icon name="bell" className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-medium text-slate-100">Notificações push</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Receba avisos de novas demandas, aprovações e rejeições neste dispositivo.
            </p>

            {!suportado ? (
              <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/90">
                Este navegador não suporta push. Instale o app (PWA) e ative por lá.
              </p>
            ) : permissao === 'denied' ? (
              <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-200/90">
                Permissão bloqueada no navegador. Libere nas configurações do site para ativar.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={toggle} disabled={ocupado} className={inscrito ? 'btn-ghost' : 'btn-primary'}>
                  {ocupado ? <Spinner className="h-4 w-4" /> : <Icon name="bell" className="h-4 w-4" />}
                  {inscrito ? 'Desativar' : 'Ativar notificações'}
                </button>
                {inscrito && (
                  <button onClick={testar} className="btn-ghost">
                    <Icon name="send" className="h-4 w-4" /> Enviar teste
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instalar PWA */}
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-accent-500/10 text-accent-400">
            <Icon name="download" className="h-5 w-5" />
          </span>
          <div>
            <p className="font-medium text-slate-100">Instalar o app</p>
            <p className="mt-0.5 text-sm text-slate-500">
              No celular, use “Adicionar à tela de início” no menu do navegador. No desktop, clique no
              ícone de instalar na barra de endereço. O app abre em tela cheia e funciona offline.
            </p>
          </div>
        </div>
      </div>

      <button onClick={logout} className="btn-danger w-full sm:w-auto">
        <Icon name="logout" className="h-4 w-4" /> Sair da conta
      </button>

      <p className="pt-2 text-center text-xs text-slate-600">Operação Maumau · v1.0</p>
    </div>
  );
}
