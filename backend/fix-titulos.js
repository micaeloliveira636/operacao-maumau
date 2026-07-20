// Script de uso único: troca travessão por "·" nos títulos já gravados.
require('dotenv').config();
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

(async () => {
  const a = await sql`update demandas set titulo = replace(titulo, ' — ', ' · ')
                      where titulo like '%—%' returning titulo`;
  const b = await sql`update demandas set titulo = replace(titulo, ' - ', ' · ')
                      where categoria = 'feedback-entrada' and titulo like '% - %' returning titulo`;
  console.log('entradas corrigidas:', a.length);
  a.forEach((x) => console.log('  ', x.titulo));
  console.log('feedbacks padronizados:', b.length);
  b.forEach((x) => console.log('  ', x.titulo));
  await sql.end();
})();
