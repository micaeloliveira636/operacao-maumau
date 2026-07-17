import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../lib/useFetch';
import { STATUS } from '../lib/constants';
import { formatarData, tempoRelativo } from '../lib/format';
import { StatusBadge, LoadingScreen, EmptyState } from '../components/ui';
import { Icon } from '../components/Icon';

const CARDS = [
  { key: 'pendente', label: 'Pendentes', icon: 'clock', status: ['pendente'], tone: 'text-slate-300' },
  { key: 'producao', label: 'Em produção', icon: 'edit', status: ['em_andamento', 'rejeitado'], tone: 'text-blue-300' },
  { key: 'aprovacao', label: 'Aguardando aprovação', icon: 'eye', status: ['enviado'], tone: 'text-amber-300' },
  { key: 'agendar', label: 'Prontas p/ agendar', icon: 'send', status: ['aprovado', 'agendamento_pendente'], tone: 'text-brand-200' },
];

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { data, carregando } = useFetch('/demandas', []);

  if (carregando) return <LoadingScreen label="Carregando demandas" />;

  const demandas = data?.demandas || [];
  const cont = (statuses) => demandas.filter((d) => statuses.includes(d.status)).length;
  const recentes = [...demandas]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 6);
  // "Próximas por prazo" = só HOJE e dias FUTUROS (nunca dias que já passaram).
  const hojeISO = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
  const proximas = demandas
    .filter((d) => !['concluido'].includes(d.status))
    .filter((d) => String(d.dataAlvo).slice(0, 10) >= hojeISO)
    .sort((a, b) => new Date(a.dataAlvo) - new Date(b.dataAlvo))
    .slice(0, 5);

  return (
    <div className="page max-w-6xl animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Olá, {user?.nome?.split(' ')[0]}</h1>
          <p className="page-sub">
            {isAdmin ? 'Visão geral da operação.' : 'Suas demandas atribuídas.'}
          </p>
        </div>
        {isAdmin && (
          <Link to="/demandas/nova" className="btn-primary hidden sm:inline-flex">
            <Icon name="plus" className="h-4 w-4" /> Nova demanda
          </Link>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CARDS.map((c, i) => (
          <Link
            to="/board"
            key={c.key}
            style={{ animationDelay: `${i * 0.06}s` }}
            className="card card-lift animate-card group flex flex-col gap-3 p-4 hover:border-brand-400/30"
          >
            <div className="flex items-center justify-between">
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] ${c.tone}`}>
                <Icon name={c.icon} className="h-[18px] w-[18px]" />
              </span>
              <Icon name="chevronRight" className="h-4 w-4 text-slate-600 transition group-hover:text-slate-400" />
            </div>
            <div>
              <p className="text-xl font-semibold text-white sm:text-2xl">{cont(c.status)}</p>
              <p className="text-[11px] text-slate-500 sm:text-xs">{c.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Próximas por data-alvo */}
        <div className="panel card-pad lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Próximas por prazo</h2>
            <Link to="/board" className="text-xs text-brand-300 hover:text-brand-200">Ver board</Link>
          </div>
          {proximas.length === 0 ? (
            <EmptyState icon="calendar" titulo="Nada agendado" descricao="Sem demandas em aberto." />
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {proximas.map((d) => (
                <li key={d.id}>
                  <Link to={`/demandas/${d.id}`} className="row-hover -mx-2 flex items-center gap-3 rounded-lg px-2 py-3">
                    <div className="flex h-11 w-11 flex-none flex-col items-center justify-center rounded-lg border border-white/5 bg-ink-800 text-center">
                      <span className="text-sm font-semibold leading-none text-slate-100">
                        {formatarData(d.dataAlvo).split(' ')[0]}
                      </span>
                      <span className="text-[10px] uppercase text-slate-500">
                        {formatarData(d.dataAlvo).split(' ')[1]}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-100">{d.titulo}</p>
                      <p className="truncate text-xs text-slate-500">
                        {d.categoria} · {(d.horarios || []).length} horário(s)
                      </p>
                    </div>
                    <StatusBadge status={d.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Atividade recente */}
        <div className="panel card-pad">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Atualizadas há pouco</h2>
          {recentes.length === 0 ? (
            <p className="text-sm text-slate-500">Sem atividade.</p>
          ) : (
            <ul className="space-y-3">
              {recentes.map((d) => (
                <li key={d.id}>
                  <Link to={`/demandas/${d.id}`} className="block transition hover:opacity-80">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 flex-none rounded-full bg-current ${
                          STATUS[d.status]?.tone === 'rose' ? 'text-rose-400' : 'text-brand-400'
                        }`}
                      />
                      <p className="truncate text-sm text-slate-200">{d.titulo}</p>
                    </div>
                    <p className="ml-3.5 text-[11px] text-slate-600">
                      {STATUS[d.status]?.label} · {tempoRelativo(d.updatedAt || d.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
