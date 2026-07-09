import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

// Hook simples de GET com estado de loading/erro e refetch.
export function useFetch(path, deps = []) {
  const [data, setData] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await api.get(path);
      setData(res);
    } catch (e) {
      setErro(e);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const res = await api.get(path);
        if (vivo) setData(res);
      } catch (e) {
        if (vivo) setErro(e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, erro, carregando, recarregar, setData };
}
