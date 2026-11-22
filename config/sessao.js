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

/**
 * Armazem com reserva: usa o MySQL e, se ele falhar (tabela "sessoes" ausente, banco fora do ar...),
 * registra o erro CLARO no console e passa a usar a reserva (memoria), em vez de derrubar todas as paginas.
 * So existe em desenvolvimento: em producao nao ha reserva e o erro aparece (melhor falhar do que perder logins sem avisar).
 * shortcut: a reserva em memoria perde o login ao reiniciar; rode a migracao 003 e reinicie para voltar ao MySQL.
 */
class ArmazemComReserva extends require('express-session').Store {
  /**
   * @param {object} principal armazem do MySQL
   * @param {object|null} reserva armazem de memoria (null = sem reserva)
   * @param {function(string, Error): void} avisar onde registrar o erro (console.error por padrao)
   */
  constructor(principal, reserva, avisar = console.error) {
    super();
    this.principal = principal;
    this.reserva = reserva;
    this.avisar = avisar;
    this.emUso = principal;
  }

  /** Troca para a reserva (uma vez so) e explica o motivo no console. */
  usarReserva(erro) {
    if (this.emUso === this.reserva || !this.reserva) return false;
    this.avisar('ERRO: o armazem de sessoes no MySQL falhou (a tabela "sessoes" existe? rode migracoes/003-sessoes.sql). '
      + 'Usando a memoria por enquanto: o login cai ao reiniciar o servidor.', erro);
    this.emUso = this.reserva;
    return true;
  }

  /** Chama `metodo` no armazem em uso; se o MySQL falhar, troca para a reserva e tenta de novo. */
  _chamar(metodo, args) {
    const cb = args[args.length - 1];
    const resto = args.slice(0, -1);
    const alvo = this.emUso;
    alvo[metodo](...resto, (erro, ...res) => {
      if (erro && alvo === this.principal && this.usarReserva(erro)) return this.reserva[metodo](...resto, cb);
      return cb(erro, ...res);
    });
  }

  get(sid, cb) { this._chamar('get', [sid, cb]); }
  set(sid, sessao, cb) { this._chamar('set', [sid, sessao, cb]); }
  destroy(sid, cb) { this._chamar('destroy', [sid, cb]); }
  touch(sid, sessao, cb) { this._chamar('touch', [sid, sessao, cb]); }
}

/**
 * Armazem usado pelo app: MySQL com reserva em memoria (so fora de producao).
 * Ja confere a tabela ao iniciar, para o erro aparecer no console logo na subida.
 * @param {Function} session o modulo express-session
 * @param {object} pool pool mysql2/promise (config/db.js)
 * @param {object} env variaveis de ambiente (process.env)
 */
function criarArmazemSeguro(session, pool, env = process.env) {
  const principal = criarArmazem(session, pool);
  const reserva = env.NODE_ENV === 'production' ? null : new session.MemoryStore();
  const armazem = new ArmazemComReserva(principal, reserva);
  Promise.resolve(pool.query('SELECT 1 FROM sessoes LIMIT 1')).catch((erro) => armazem.usarReserva(erro));
  return armazem;
}

module.exports = { criarArmazem, criarArmazemSeguro, ArmazemComReserva, COOKIE, DURACAO_MS };
