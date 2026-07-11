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
  const { user, logout, isAdmin } = useAuth();
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
    <div className="page max-w-2xl animate-fade-up">
      <h1 className="page-title">Ajustes</h1>

      {/* Perfil */}
      <div className="card card-pad flex items-center gap-4">
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
      <div className="card card-pad">
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
      <div className="card card-pad">
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

      {isAdmin && <SendflowSettings />}

      <button onClick={logout} className="btn-danger w-full sm:w-auto">
        <Icon name="logout" className="h-4 w-4" /> Sair da conta
      </button>

      <p className="pt-2 text-center text-xs text-slate-600">Operação Maumau · v1.0</p>
    </div>
  );
}

const CAMPOS_SENDFLOW = [
  { k: 'sendflow_api_url', label: 'URL da API', ph: 'https://api.sendflow.pro' },
  { k: 'sendflow_api_token', label: 'Token (Bearer)', ph: 'cole o token', secret: true },
  { k: 'sendflow_notify_account', label: 'Chip de avisos (accountId)', ph: 'id da conta de notificação' },
];
const CAMPOS_AVANCADO = [
  { k: 'sendflow_releases_path', label: 'Path releases', ph: '/sendapi/releases/:releaseId' },
  { k: 'sendflow_send_path', label: 'Path envio', ph: '/sendapi/actions' },
  { k: 'sendflow_notify_path', label: 'Path notificação', ph: '/sendapi/messages/text' },
  { k: 'release_ativos1', label: 'Release ATIVOS 1' },
  { k: 'release_ativos2', label: 'Release ATIVOS 2' },
  { k: 'release_aquecimento', label: 'Release AQUECIMENTO' },
];

function SendflowSettings() {
  const toast = useToast();
  const [cfg, setCfg] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [avancado, setAvancado] = useState(false);

  useEffect(() => {
    api.get('/configuracoes').then((d) => setCfg(d.config)).catch(() => {});
  }, []);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  async function salvar() {
    setSalvando(true);
    try {
      // não reenvia o token se for a máscara
      const body = { ...cfg };
      if (body.sendflow_api_token?.includes('•')) delete body.sendflow_api_token;
      const d = await api.put('/configuracoes', body);
      setCfg(d.config);
      toast.sucesso('Configurações salvas');
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    try {
      const r = await api.post('/configuracoes/testar-sendflow');
      if (r.ok) toast.sucesso(`Conectado — ${r.accountIds} accountIds no release`);
      else toast.erro(`Falhou: ${r.error}`);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setTestando(false);
    }
  }

  const [reconferindo, setReconferindo] = useState(false);
  async function reconferir() {
    setReconferindo(true);
    try {
      const r = await api.post('/demandas/reconferir-chips');
      toast.sucesso(`Reconferência: ${r.verificados} envio(s), ${r.reagendados} reagendado(s), ${r.semMudanca} sem mudança`);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setReconferindo(false);
    }
  }

  if (!cfg) return null;

  return (
    <div className="card card-pad">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">
          <Icon name="send" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-100">Integração SendFlow</p>
          <p className="mt-0.5 text-sm text-slate-500">
            Necessário para o painel agendar direto (e opcional para avisos por WhatsApp).
          </p>

          <div className="mt-4 space-y-3">
            {CAMPOS_SENDFLOW.map((c) => (
              <div key={c.k}>
                <label className="label">
                  {c.label}
                  {c.secret && cfg[`${c.k}_definido`] && (
                    <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">definido</span>
                  )}
                </label>
                <input
                  className="input"
                  type={c.secret ? 'password' : 'text'}
                  value={cfg[c.k] || ''}
                  placeholder={c.ph}
                  onChange={(e) => set(c.k, e.target.value)}
                />
              </div>
            ))}

            <button onClick={() => setAvancado((v) => !v)} className="link-quiet text-xs">
              {avancado ? '− ocultar' : '+ opções avançadas'} (paths e release IDs)
            </button>
            {avancado && (
              <div className="grid gap-3 sm:grid-cols-2">
                {CAMPOS_AVANCADO.map((c) => (
                  <div key={c.k}>
                    <label className="label">{c.label}</label>
                    <input className="input" value={cfg[c.k] || ''} placeholder={c.ph}
                      onChange={(e) => set(c.k, e.target.value)} />
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={salvar} disabled={salvando} className="btn-primary">
                {salvando ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />} Salvar
              </button>
              <button onClick={testar} disabled={testando} className="btn-ghost">
                {testando ? <Spinner className="h-4 w-4" /> : <Icon name="refresh" className="h-4 w-4" />} Testar conexão
              </button>
              <button onClick={reconferir} disabled={reconferindo} className="btn-ghost">
                {reconferindo ? <Spinner className="h-4 w-4" /> : <Icon name="clock" className="h-4 w-4" />} Reconferir chips agora
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              A reconferência roda sozinha via cron externo (a cada ~5min). Este botão força uma verificação manual dos envios das próximas horas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
