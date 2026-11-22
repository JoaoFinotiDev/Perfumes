/**
 * config/sessao.js
 * Tudo sobre a SESSÃO (é ela que lembra quem está logado e o que está no carrinho).
 *
 * Onde a sessão fica: na tabela "sessoes" do MySQL.
 *   Antes ficava na memória do servidor, e cada reinício (o nodemon reinicia a cada arquivo salvo)
 *   tirava todo mundo do login. No banco, o login sobrevive ao reinício.
 *
 * O que este arquivo oferece:
 *   1. COOKIE / criarCookie   -> como o cookie de sessão é configurado (8 horas, httpOnly, sameSite);
 *   2. criarArmazemSeguro     -> o "armazém" (store) que o app.js usa: MySQL, com reserva em memória
 *                                só em desenvolvimento, caso a tabela não exista;
 *   3. iniciarLimpeza         -> apaga, de 15 em 15 minutos, as sessões vencidas;
 *   4. salvarAntesDeRedirecionar -> grava a sessão ANTES de um redirect (senão a página seguinte lê dado velho).
 *
 * Usa o MESMO pool de config/db.js (nenhuma conexão nova com outra configuração).
 * A tabela vem do script.sql (ou de migracoes/003-sessoes.sql); o pacote não cria nada sozinho.
 */
const MySQLStore = require('express-mysql-session');

/** Quanto tempo o login dura: 8 horas (em milissegundos). Vale para o cookie e para a linha no banco. */
const DURACAO_MS = 8 * 60 * 60 * 1000;

/** Nome do cookie de sessão (o padrão do express-session). O logout usa o mesmo nome para apagar o cookie. */
const NOME_COOKIE = 'connect.sid';

/** De quanto em quanto tempo apagamos as sessões vencidas: 15 minutos. */
const INTERVALO_LIMPEZA_MS = 15 * 60 * 1000;

/**
 * Os ÚNICOS erros que justificam trocar para a memória: tabela "sessoes" inexistente
 * ou MySQL fora do alcance. Qualquer outro erro só é registrado (não esconde um defeito de verdade).
 */
const ERROS_DE_RESERVA = ['ER_NO_SUCH_TABLE', 'ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST'];

// ---------- 1. Cookie ----------

/**
 * Opções do cookie de sessão:
 *  - httpOnly: só o servidor lê o cookie (o JavaScript da página não consegue roubá-lo);
 *  - sameSite 'lax': o navegador não manda o cookie num POST que vem de outro site;
 *  - secure (só em produção): o cookie só viaja por HTTPS (o app.js liga o `trust proxy`).
 * Em desenvolvimento não tem `secure`, senão o login quebraria em http://localhost e na rede local.
 * @param {object} env variáveis de ambiente (process.env)
 */
function criarCookie(env = process.env) {
  const cookie = { httpOnly: true, sameSite: 'lax', maxAge: DURACAO_MS };
  if (env.NODE_ENV === 'production') cookie.secure = true;
  return cookie;
}

/** Cookie já montado com o ambiente atual (é o que o app.js usa). */
const COOKIE = criarCookie();

// ---------- 2. Limpeza das sessões vencidas ----------

/**
 * Apaga as sessões vencidas de tempos em tempos. Se o MySQL falhar, só registra o erro: o processo nunca cai.
 * (A limpeza do próprio pacote deixava uma promise rejeitada solta, e o Node 15+ encerra o processo nesse caso.)
 * O `.unref()` faz este temporizador, sozinho, não segurar o Node ligado.
 * @param {object} armazem armazém do MySQL (tem clearExpiredSessions)
 * @param {number} intervalo tempo entre limpezas, em ms (só os testes mudam)
 * @returns {NodeJS.Timeout} o temporizador
 */
function iniciarLimpeza(armazem, intervalo = INTERVALO_LIMPEZA_MS) {
  const temporizador = setInterval(() => {
    armazem.clearExpiredSessions()
      .catch((erro) => console.error('ERRO ao apagar sessões vencidas (tento de novo mais tarde):', erro));
  }, intervalo);
  temporizador.unref();
  return temporizador;
}

// ---------- 3. Armazém (onde as sessões ficam) ----------

/**
 * Cria o armazém de sessões no MySQL (pacote express-mysql-session).
 * @param {Function} session o módulo express-session
 * @param {object} pool pool mysql2/promise (config/db.js)
 * @returns {object} armazém para o `store` do express-session
 */
function criarArmazem(session, pool) {
  const Armazem = MySQLStore(session);
  const armazem = new Armazem({
    schema: { tableName: 'sessoes' },
    createDatabaseTable: false,    // a tabela é criada pelo script.sql / migração 003
    expiration: DURACAO_MS,        // sessão mais velha que isso vence
    clearExpired: false            // a limpeza é a nossa (iniciarLimpeza), que nunca derruba o processo
  }, pool);
  armazem.limpeza = iniciarLimpeza(armazem); // guardado para os testes poderem parar
  return armazem;
}

/**
 * Armazém com RESERVA (padrão de projeto "proxy"): repassa cada pedido ao MySQL; se o MySQL falhar
 * porque a tabela não existe ou o banco está fora do ar, avisa no console UMA vez e passa a usar a memória,
 * em vez de derrubar todas as páginas.
 * Só existe em desenvolvimento: em produção não há reserva e o erro aparece (melhor falhar do que perder logins calado).
 * shortcut: a reserva em memória perde o login ao reiniciar; rode a migração 003 e reinicie para voltar ao MySQL.
 */
class ArmazemComReserva extends require('express-session').Store {
  /**
   * @param {object} principal armazém do MySQL
   * @param {object|null} reserva armazém de memória (null = sem reserva)
   * @param {function(string, Error): void} avisar onde registrar o erro (console.error por padrão)
   */
  constructor(principal, reserva, avisar = console.error) {
    super();
    this.principal = principal;
    this.reserva = reserva;
    this.avisar = avisar;
    this.emUso = principal; // começa sempre pelo MySQL
  }

  /**
   * Troca para a reserva (uma vez só) e explica o motivo no console.
   * Só troca para os erros de ERROS_DE_RESERVA; qualquer outro erro só é registrado.
   * @param {Error} erro o erro que o MySQL devolveu
   * @returns {boolean} true se trocou
   */
  usarReserva(erro) {
    if (this.emUso === this.reserva || !this.reserva) return false;
    if (!erro || !ERROS_DE_RESERVA.includes(erro.code)) {
      this.avisar('ERRO no armazém de sessoes (não é tabela ausente nem conexão recusada, então não troco para a memória):', erro);
      return false;
    }
    this.avisar('ERRO: o armazém de sessoes no MySQL falhou (a tabela "sessoes" existe? rode migracoes/003-sessoes.sql). '
      + 'Usando a memória por enquanto: o login cai ao reiniciar o servidor.', erro);
    this.emUso = this.reserva;
    return true;
  }

  /**
   * Chama `metodo` no armazém em uso. Se o MySQL falhar com um erro de reserva, troca e repete o mesmo pedido na memória.
   * @param {string} metodo get, set, destroy ou touch
   * @param {Array} args argumentos do pedido; o último é sempre o callback
   */
  _chamar(metodo, args) {
    const cb = args[args.length - 1];
    const resto = args.slice(0, -1);
    const alvo = this.emUso;
    alvo[metodo](...resto, (erro, ...res) => {
      if (erro && alvo === this.principal && this.usarReserva(erro)) return this.reserva[metodo](...resto, cb);
      return cb(erro, ...res);
    });
  }

  // Os quatro métodos que o express-session pede de um armazém: ler, gravar, apagar e renovar a validade.
  get(sid, cb) { this._chamar('get', [sid, cb]); }
  set(sid, sessao, cb) { this._chamar('set', [sid, sessao, cb]); }
  destroy(sid, cb) { this._chamar('destroy', [sid, cb]); }
  touch(sid, sessao, cb) { this._chamar('touch', [sid, sessao, cb]); }
}

/**
 * Armazém usado pelo app: MySQL com reserva em memória (só fora de produção).
 * Já confere a tabela ao iniciar, para o erro aparecer no console logo na subida.
 * @param {Function} session o módulo express-session
 * @param {object} pool pool mysql2/promise (config/db.js)
 * @param {object} env variáveis de ambiente (process.env)
 */
function criarArmazemSeguro(session, pool, env = process.env) {
  const principal = criarArmazem(session, pool);
  const reserva = env.NODE_ENV === 'production' ? null : new session.MemoryStore();
  const armazem = new ArmazemComReserva(principal, reserva);
  Promise.resolve(pool.query('SELECT 1 FROM sessoes LIMIT 1')).catch((erro) => armazem.usarReserva(erro));
  return armazem;
}

// ---------- 4. Gravar antes de redirecionar ----------

/**
 * Middleware: grava a sessão no MySQL ANTES de mandar um redirect.
 * Por que: o express-session envia os cabeçalhos do 302 antes de terminar de gravar. Com a sessão no MySQL
 * (gravação assíncrona), o navegador seguia o redirect e lia a sessão ANTIGA: por exemplo, "Adicionar"
 * levava a um carrinho vazio. Salvando primeiro, a próxima página já vê o dado novo.
 * Sem sessão (ex.: depois do logout, que destrói a sessão) o redirect sai direto.
 * Se a gravação falhar, o erro vai para o tratador de erros (melhor avisar do que perder o carrinho calado).
 */
function salvarAntesDeRedirecionar(req, res, next) {
  const redirecionar = res.redirect.bind(res);
  res.redirect = (...args) => {
    if (!req.session) return redirecionar(...args);
    req.session.save((erro) => (erro ? next(erro) : redirecionar(...args)));
  };
  next();
}

module.exports = {
  salvarAntesDeRedirecionar,
  criarArmazem, criarArmazemSeguro, iniciarLimpeza, ArmazemComReserva,
  criarCookie, COOKIE, NOME_COOKIE, DURACAO_MS
};
