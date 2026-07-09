// Registro do service worker + inscrição de Web Push.
import { api } from './api';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSuportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.error('Falha ao registrar service worker:', err);
    return null;
  }
}

export function permissaoAtual() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}

export async function ativarNotificacoes() {
  if (!pushSuportado()) throw new Error('Push não suportado neste navegador');
  if (!VAPID_PUBLIC) throw new Error('VITE_VAPID_PUBLIC_KEY não configurada');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão negada');

  const reg = (await navigator.serviceWorker.ready) || (await registrarServiceWorker());
  if (!reg) throw new Error('Service worker indisponível');

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }

  const json = sub.toJSON();
  await api.post('/notificacoes/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
  });
  return true;
}

export async function desativarNotificacoes() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const { endpoint } = sub.toJSON();
    await api.post('/notificacoes/unsubscribe', { endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}

export async function estaInscrito() {
  if (!pushSuportado()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}
