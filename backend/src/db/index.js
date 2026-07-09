const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const schema = require('./schema');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL não configurada');
}

const client = postgres(connectionString, { ssl: 'require' });
const db = drizzle(client, { schema });

module.exports = { db, client };
