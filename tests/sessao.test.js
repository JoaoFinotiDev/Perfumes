/**
 * tests/sessao.test.js
 * Testa (sem rede e sem banco) a sessão persistente:
 *  - o segredo de desenvolvimento é o MESMO entre duas chamadas (o login sobrevive ao reinício);
 *  - o armazém de sessões no MySQL é configurado com a tabela "sessoes" e 8 horas de duração.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const session = require('express-session');
const { resolverSegredo, SEGREDO_DE_EXEMPLO } = require('../config/segredo');
const ejs = require('ejs');
const { criarArmazem, criarArmazemSeguro, iniciarLimpeza, ArmazemComReserva, criarCookie, COOKIE, NOME_COOKIE, DURACAO_MS } = require('../config/sessao');
const { tratarErro } = require('../middlewares/erros');
const AuthController = require('../controllers/AuthController');

test('segredo de desenvolvimento: gerado na primeira vez e igual na segunda chamada', () => {
  const arquivo = path.join(os.tmpdir(), `segredo-dev-${process.pid}-${Date.now()}`);
  const avisos = [];
  try {
    const primeiro = resolverSegredo({}, (m) => avisos.push(m), arquivo);
    const segundo = resolverSegredo({}, (m) => avisos.push(m), arquivo);
    assert.ok(primeiro.length >= 32);
    assert.strictEqual(segundo, primeiro); // mesmo segredo = o cookie antigo continua valendo
    assert.strictEqual(fs.readFileSync(arquivo, 'utf8').trim(), primeiro);
  } finally { fs.rmSync(arquivo, { force: true }); }
});

test('segredo vindo do ambiente tem prioridade e nao cria arquivo', () => {
  const arquivo = path.join(os.tmpdir(), `segredo-dev-nao-${process.pid}-${Date.now()}`);
  assert.strictEqual(resolverSegredo({ SESSION_SECRET: 'meu-segredo-de-verdade' }, () => {}, arquivo), 'meu-segredo-de-verdade');
  assert.strictEqual(fs.existsSync(arquivo), false);
});

test('armazem de sessoes: tabela "sessoes", 8 horas, usa o pool recebido; cookie httpOnly + lax', async () => {
  const consultas = [];
  const poolFalso = { query: async (sql) => { consultas.push(sql); return [[], []]; } };
  const armazem = criarArmazem(session, poolFalso);
  try {
    assert.ok(armazem instanceof session.Store);
    assert.strictEqual(armazem.options.schema.tableName, 'sessoes');
    assert.strictEqual(armazem.options.expiration, 8 * 60 * 60 * 1000);
    assert.strictEqual(armazem.options.createDatabaseTable, false); // a tabela vem do script.sql
  } finally {
    await armazem.onReady(); // espera o pacote terminar de iniciar; fechar antes deixaria o temporizador ligado
    await armazem.close();
  }
  assert.deepStrictEqual(COOKIE, { httpOnly: true, sameSite: 'lax', maxAge: DURACAO_MS });
});

test('se o MySQL falhar em desenvolvimento, loga o erro e cai para a memoria; em producao nao ha reserva', async () => {
  const poolQuebrado = { query: async () => { throw Object.assign(new Error('Table sessoes doesn\'t exist'), { code: 'ER_NO_SUCH_TABLE' }); } };
  const erros = [];
  const original = console.error;
  console.error = (...a) => erros.push(a.join(' '));
  try {
    const armazem = criarArmazemSeguro(session, poolQuebrado, { NODE_ENV: 'development' });
    await new Promise((r) => setImmediate(r)); // deixa o teste da tabela falhar
    assert.ok(erros.some((e) => /sessoes/.test(e)), 'o erro claro foi para o console');
    // A sessão grava e lê na reserva (memória), sem lançar erro.
    await new Promise((ok, no) => armazem.set('abc', { cookie: { maxAge: 1000 }, usuario: 'x' }, (e) => (e ? no(e) : ok())));
    const lida = await new Promise((ok, no) => armazem.get('abc', (e, s) => (e ? no(e) : ok(s))));
    assert.strictEqual(lida.usuario, 'x');
    assert.ok(armazem.reserva instanceof session.MemoryStore);
    const producao = criarArmazemSeguro(session, poolQuebrado, { NODE_ENV: 'production' });
    assert.strictEqual(producao.reserva, null);
    await producao.principal.onReady(); await armazem.principal.onReady(); // só fecha depois de iniciar
    await producao.principal.close();
    await armazem.principal.close(); // encerra o temporizador do pacote, senão o teste não termina
  } finally { console.error = original; }
});

test('a pagina de erro desenha sem usuario, mostrarCarrinho, aviso nem moeda (nao lanca erro)', async () => {
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'erro.ejs'), { titulo: 'Erro no servidor', mensagem: 'Algo deu errado.' });
  assert.match(html, /Erro no servidor/);
  assert.match(html, /Entrar/); // sem usuario: menu de visitante
});



test('limpeza de sessoes: se o MySQL rejeitar, o erro e logado e o processo NAO cai', async () => {
  const erros = [];
  const original = console.error;
  console.error = (...a) => erros.push(a.join(' '));
  try {
    const armazemFalso = { clearExpiredSessions: () => Promise.reject(new Error('MySQL fora do ar')) };
    const timer = iniciarLimpeza(armazemFalso, 5);
    await new Promise((r) => setTimeout(r, 40)); // deixa o temporizador rodar algumas vezes
    clearInterval(timer);
    assert.ok(erros.some((e) => /MySQL fora do ar/.test(e)), 'o erro foi logado');
  } finally { console.error = original; }
});

test('criarArmazem desliga a limpeza do pacote (clearExpired: false) e usa a nossa', async () => {
  const armazem = criarArmazem(session, { query: async () => [[], []] });
  try {
    assert.strictEqual(armazem.options.clearExpired, false);
    assert.ok(armazem.limpeza, 'temporizador proprio ligado');
  } finally {
    clearInterval(armazem.limpeza);
    await armazem.onReady();
    await armazem.close();
  }
});

test('reserva em memoria: so para tabela inexistente ou conexao recusada; outros erros so logam', () => {
  const avisos = [];
  const novo = () => new ArmazemComReserva({}, new session.MemoryStore(), (...a) => avisos.push(a[0]));
  const outro = novo();
  assert.strictEqual(outro.usarReserva(Object.assign(new Error('x'), { code: 'ER_ACCESS_DENIED_ERROR' })), false);
  assert.strictEqual(outro.emUso, outro.principal); // não trocou
  assert.strictEqual(avisos.length, 1); // mas logou
  for (const code of ['ER_NO_SUCH_TABLE', 'ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST']) {
    const a = novo();
    assert.strictEqual(a.usarReserva(Object.assign(new Error('x'), { code })), true, code);
    assert.strictEqual(a.emUso, a.reserva);
  }
});

test('cookie: secure so em producao', () => {
  assert.strictEqual(criarCookie({ NODE_ENV: 'production' }).secure, true);
  assert.strictEqual('secure' in criarCookie({ NODE_ENV: 'development' }), false);
  assert.strictEqual('secure' in criarCookie({}), false);
});

test('segredo igual ao exemplo do .env.example conta como vazio em desenvolvimento (usa o arquivo); em producao falha', () => {
  const arquivo = path.join(os.tmpdir(), `segredo-dev-ex-${process.pid}-${Date.now()}`);
  try {
    const s = resolverSegredo({ SESSION_SECRET: SEGREDO_DE_EXEMPLO }, () => {}, arquivo);
    assert.notStrictEqual(s, SEGREDO_DE_EXEMPLO);
    assert.ok(s.length >= 32);
    assert.throws(() => resolverSegredo({ SESSION_SECRET: SEGREDO_DE_EXEMPLO, NODE_ENV: 'production' }, () => {}, arquivo));
  } finally { fs.rmSync(arquivo, { force: true }); }
});

/** Resposta falsa: guarda o que o tratador de erros fez. */
function respostaFalsa(headersSent = false) {
  const r = { headersSent, locals: {}, codigo: null, tela: null };
  r.status = (c) => { r.codigo = c; return r; };
  r.render = (v, d) => { r.tela = { v, ...d }; };
  return r;
}

test('tratador de erros: status de err.status / err.statusCode, 500 por padrao, mensagem amigavel', () => {
  const original = console.error;
  console.error = () => {};
  try {
    const casos = [[{ status: 404 }, 404, /não encontrada/], [{ statusCode: 403 }, 403, /Acesso negado/],
      [{ status: 400 }, 400, /inválido/], [new Error('boom'), 500, /Erro no servidor/], [{ status: 'abc' }, 500, /Erro no servidor/]];
    for (const [err, status, titulo] of casos) {
      const res = respostaFalsa();
      tratarErro(err, {}, res, () => assert.fail('nao deveria chamar next'));
      assert.strictEqual(res.codigo, status);
      assert.match(res.tela.titulo, titulo);
      assert.strictEqual(res.locals.usuario, null);
    }
    // Resposta já começou: passa o erro adiante, sem desenhar nada.
    const res = respostaFalsa(true);
    const erro = new Error('tarde demais');
    let recebido = null;
    tratarErro(erro, {}, res, (e) => { recebido = e; });
    assert.strictEqual(recebido, erro);
    assert.strictEqual(res.tela, null);
  } finally { console.error = original; }
});

test('logout: destrói a sessao e apaga o cookie', () => {
  const chamadas = [];
  const req = { session: { destroy: (cb) => { chamadas.push('destroy'); cb(); } } };
  const res = { clearCookie: (n) => chamadas.push(`clearCookie:${n}`), redirect: (u) => chamadas.push(`redirect:${u}`) };
  new AuthController({}).logout(req, res);
  assert.deepStrictEqual(chamadas, ['destroy', `clearCookie:${NOME_COOKIE}`, 'redirect:/']);
});

test('carrinho.ejs mostra o percentual que vem do resumo (nao um 5% fixo)', async () => {
  const base = { erro: null, usuario: null, mostrarCarrinho: true, aviso: null, moeda: require('../utils/moeda'), formas: { pix: 'Pix' } };
  const linhas = [{ nome: 'X', marca: 'Y', quantidade: 2, unitario: 45, subtotal: 90, perfumeId: 1, variacaoId: '' }];
  const resumo = { linhas, subtotal: 100, desconto: 10, total: 90, temDesconto: true, percentualTexto: '10%' };
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'carrinho.ejs'), { ...base, resumo });
  assert.match(html, /Desconto de cliente \(10%\)/);
});

test('redirect so sai depois de gravar a sessao (senao o carrinho aparecia vazio)', async () => {
  const { salvarAntesDeRedirecionar } = require('../config/sessao');
  const ordem = [];
  // save assincrono, como no MySQL: termina "depois".
  const req = { session: { save: (cb) => setImmediate(() => { ordem.push('save'); cb(); }) } };
  const res = { redirect: (u) => ordem.push(`redirect:${u}`) };
  salvarAntesDeRedirecionar(req, res, () => {});
  res.redirect('/carrinho');
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(ordem, ['save', 'redirect:/carrinho']);

  // Sem sessão (logout): redireciona direto. Erro ao gravar: vai para o next.
  const semSessao = []; const res2 = { redirect: (u) => semSessao.push(u) };
  salvarAntesDeRedirecionar({}, res2, () => {}); res2.redirect('/');
  assert.deepStrictEqual(semSessao, ['/']);
  let erroRecebido = null; const falha = new Error('mysql caiu');
  const res3 = { redirect: () => { throw new Error('nao devia redirecionar'); } };
  salvarAntesDeRedirecionar({ session: { save: (cb) => cb(falha) } }, res3, (e) => { erroRecebido = e; });
  res3.redirect('/');
  assert.strictEqual(erroRecebido, falha);
});
