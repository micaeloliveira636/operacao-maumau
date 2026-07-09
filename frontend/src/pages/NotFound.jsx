import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center animate-fade-in">
      <p className="text-6xl font-bold text-brand-500/30">404</p>
      <p className="text-slate-400">Página não encontrada.</p>
      <Link to="/" className="btn-primary">
        <Icon name="dashboard" className="h-4 w-4" /> Voltar ao início
      </Link>
    </div>
  );
}
