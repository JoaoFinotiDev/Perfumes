/**
 * config/sessao.js
 * Onde as sessoes (o login) ficam guardadas: na tabela "sessoes" do MySQL.
 * Antes ficavam na memoria do servidor, e cada reinicio (o nodemon reinicia a cada arquivo salvo)
 * derrubava o login de todo mundo. No banco, o login sobrevive ao reinicio.
 * Usa o MESMO pool de config/db.js (nenhuma conexao nova com outra configuracao).
 * A tabela vem do script.sql (ou de migracoes/003-sessoes.sql); o pacote nao cria nada sozinho.
 */
const MySQLStore = require('express-mysql-session');

/** Quanto tempo o login dura: 8 horas (em milissegundos). Vale para o cookie e para a linha no banco. */
const DURACAO_MS = 8 * 60 * 60 * 1000;

/** Opcoes do cookie de sessao: so o servidor le (httpOnly), e nao vai em POST vindo de outro site (lax). */
const COOKIE = { httpOnly: true, sameSite: 'lax', maxAge: DURACAO_MS };

/**
 * Cria o armazem de sessoes no MySQL.
 * @param {Function} session o modulo express-session
 * @param {object} pool pool mysql2/promise (config/db.js)
 * @returns {object} armazem para o `store` do express-session
 */
function criarArmazem(session, pool) {
  const Armazem = MySQLStore(session);
  return new Armazem({
    schema: { tableName: 'sessoes' },
    createDatabaseTable: false,    // a tabela e criada pelo script.sql / migracao 003
    expiration: DURACAO_MS,        // sessao mais velha que isso vence
    clearExpired: true,            // o pacote apaga sozinho as sessoes vencidas...
    checkExpirationInterval: 15 * 60 * 1000 // ...a cada 15 minutos
  }, pool);
}

module.exports = { criarArmazem, COOKIE, DURACAO_MS };
