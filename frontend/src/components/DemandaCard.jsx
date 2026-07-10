import { Link } from 'react-router-dom';
import { StatusBadge, CategoriaTag } from './ui';
import { Icon } from './Icon';
import { formatarData } from '../lib/format';

export function DemandaCard({ demanda, compact, index = 0 }) {
  const horarios = demanda.horarios || [];
  return (
    <Link
      to={`/demandas/${demanda.id}`}
      style={{ animationDelay: `${Math.min(index, 12) * 0.05}s` }}
      className="card card-lift animate-card block p-4 hover:border-brand-400/30 hover:shadow-glow"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 flex-1 text-sm font-medium text-slate-100">{demanda.titulo}</p>
        {!compact && <StatusBadge status={demanda.status} />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-500">
        <CategoriaTag categoria={demanda.categoria} />
        <span className="inline-flex items-center gap-1">
          <Icon name="calendar" className="h-3.5 w-3.5" /> {formatarData(demanda.dataAlvo)}
        </span>
        {horarios.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Icon name="clock" className="h-3.5 w-3.5" /> {horarios.length}
          </span>
        )}
      </div>

      {(demanda.campanhasDestino || []).length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {demanda.campanhasDestino.map((c) => (
            <span key={c} className="rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-200">
              {c}
            </span>
          ))}
        </div>
      )}

      {compact && <StatusBadge status={demanda.status} className="mt-3" />}
    </Link>
  );
}
