require('dotenv').config();

const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { usuarios } = require('./schema');
const { hashPassword } = require('../utils/auth');

async function seed() {
  const client = postgres(process.env.DATABASE_URL, { ssl: 'require' });
  const db = drizzle(client);

  console.log('Criando usuário admin inicial...');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@maumau.com';
  const adminSenha = process.env.ADMIN_PASSWORD || 'mudar123';
  const adminWhatsapp = process.env.ADMIN_WHATSAPP || '+5511999999999';

  try {
    const [admin] = await db.insert(usuarios).values({
      nome: 'Micael',
      email: adminEmail,
      senhaHash: hashPassword(adminSenha),
      whatsapp: adminWhatsapp,
      role: 'admin',
      ativo: true,
    }).returning();

    console.log('Admin criado com sucesso:');
    console.log(`  Nome: ${admin.nome}`);
    console.log(`  Email: ${admin.email}`);
    console.log(`  Role: ${admin.role}`);
    console.log(`  ID: ${admin.id}`);
    console.log('\n⚠️  TROQUE A SENHA PADRÃO IMEDIATAMENTE');
  } catch (err) {
    if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
      console.log('Admin já existe, seed ignorado.');
    } else {
      console.error('Erro no seed:', err);
    }
  }

  await client.end();
  process.exit(0);
}

seed();
