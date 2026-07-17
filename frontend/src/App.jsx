import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { LoadingScreen } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Board from './pages/Board';
import NovaDemanda from './pages/NovaDemanda';
import RotinaDia from './pages/RotinaDia';
import DemandaDetalhe from './pages/DemandaDetalhe';
import Copys from './pages/Copys';
import CopyFolder from './pages/CopyFolder';
import Usuarios from './pages/Usuarios';
import Config from './pages/Config';
import NotFound from './pages/NotFound';

function Protected({ children, adminOnly }) {
  const { user, carregando, isAdmin } = useAuth();
  const location = useLocation();

  if (carregando) return <LoadingScreen label="Verificando sessão" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { user, carregando } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={carregando ? <LoadingScreen /> : user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/board" element={<Protected><Board /></Protected>} />
      <Route path="/demandas/nova" element={<Protected adminOnly><NovaDemanda /></Protected>} />
      <Route path="/rotina" element={<Protected adminOnly><RotinaDia /></Protected>} />
      <Route path="/demandas/:id" element={<Protected><DemandaDetalhe /></Protected>} />
      <Route path="/copys" element={<Protected><Copys /></Protected>} />
      <Route path="/copys/:id" element={<Protected adminOnly><CopyFolder /></Protected>} />
      <Route path="/usuarios" element={<Protected adminOnly><Usuarios /></Protected>} />
      <Route path="/config" element={<Protected><Config /></Protected>} />
      <Route path="*" element={<Protected><NotFound /></Protected>} />
    </Routes>
  );
}
