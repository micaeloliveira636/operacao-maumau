// Gera um par de chaves VAPID para Web Push.
// Uso: npm run gen:vapid
// Copie a saída para VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no .env (backend)
// e VITE_VAPID_PUBLIC_KEY no .env do frontend.
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('\nChaves VAPID geradas:\n');
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('\n(No frontend use VITE_VAPID_PUBLIC_KEY com o mesmo valor da pública.)\n');
