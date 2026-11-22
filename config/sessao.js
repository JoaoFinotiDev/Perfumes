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

/** Nome do cookie de sessao (o padrao do express-session). O logout usa o mesmo nome para apagar o cookie. */
const NOME_COOKIE = 'connect.sid';

/** De quanto em quanto tempo apagamos as sessoes vencidas: 15 minutos. */
const INTERVALO_LIMPEZA_MS = 15 * 60 * 1000;

/** Unicos erros que justificam trocar para a memoria: tabela "sessoes" inexistente ou MySQL inalcancavel. */
const ERROS_DE_RESERVA = ['ER_NO_SUCH_TABLE', 'ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST'];

/**
 * Opcoes do cookie de sessao: so o servidor le (httpOnly) e nao vai em POST vindo de outro site (lax).
 * Em producao tambem `secure`: o navegador so envia o cookie por HTTPS (o app.js liga o `trust proxy`).
 * Em desenvolvimento nao tem `secure`, senao o login quebraria em http://localhost e na rede local.
 * @param {object} env variaveis de ambiente (process.env)
 */
function criarCookie(env = process.env) {
  const cookie = { httpOnly: true, sameSite: 'lax', maxAge: DURACAO_MS };
  if (env.NODE_ENV === 'production') cookie.secure = true;
  return cookie;
}

/** Cookie com o ambiente atual. */
const COOKIE = criarCookie();

/**
 * Limpeza propria das sessoes vencidas. Se o MySQL falhar, so loga o erro: o processo nunca cai.
 * (A limpeza do pacote deixava a promise rejeitada solta, e o Node 15+ encerra o processo nesse caso.)
 * O `.unref()` impede que este temporizador, sozinho, mantenha o Node vivo.
 * @param {object} armazem armazem do MySQL (tem clearExpiredSessions)
 * @param {number} intervalo tempo entre limpezas, em ms (so os testes mudam)
 * @returns {NodeJS.Timeout} o temporizador
 */
function iniciarLimpeza(armazem, intervalo = INTERVALO_LIMPEZA_MS) {
  const temporizador = setInterval(() => {
    armazem.clearExpiredSessions()
      .catch((erro) => console.error('ERRO ao apagar sessoes vencidas (tento de novo mais tarde):', erro));
  }, intervalo);
  temporizador.unref();
  return temporizador;
}

/**
 * Cria o armazem de sessoes no MySQL.
 * @param {Function} session o modulo express-session
 * @param {object} pool pool mysql2/promise (config/db.js)
 * @returns {object} armazem para o `store` do express-session
 */
function criarArmazem(session, pool) {
  const Armazem = MySQLStore(session);
  const armazem = new Armazem({
    schema: { tableName: 'sessoes' },
    createDatabaseTable: false,    // a tabela e criada pelo script.sql / migracao 003
    expiration: DURACAO_MS,        // sessao mais velha que isso vence
    clearExpired: false            // a limpeza e a nossa (iniciarLimpeza), que nunca derruba o processo
  }, pool);
  armazem.limpeza = iniciarLimpeza(armazem); // guardado para os testes poderem parar
  return armazem;
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

  /**
   * Troca para a reserva (uma vez so) e explica o motivo no console.
   * So troca se o erro for "tabela inexistente" ou "MySQL inalcancavel"; qualquer outro erro so e logado.
   * @returns {boolean} true se trocou
   */
  usarReserva(erro) {
    if (this.emUso === this.reserva || !this.reserva) return false;
    if (!erro || !ERROS_DE_RESERVA.includes(erro.code)) {
      this.avisar('ERRO no armazem de sessoes (nao e tabela ausente nem conexao recusada, entao nao troco para a memoria):', erro);
      return false;
    }
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

module.exports = {
  criarArmazem, criarArmazemSeguro, iniciarLimpeza, ArmazemComReserva,
  criarCookie, COOKIE, NOME_COOKIE, DURACAO_MS
};
