/**
 * tests/sessao.test.js
 * Testa (sem rede e sem banco) a sessao persistente:
 *  - o segredo de desenvolvimento e o MESMO entre duas chamadas (o login sobrevive ao reinicio);
 *  - o armazem de sessoes no MySQL e configurado com a tabela "sessoes" e 8 horas de duracao.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const session = require('express-session');
const { resolverSegredo } = require('../config/segredo');
const ejs = require('ejs');
const { criarArmazem, criarArmazemSeguro, COOKIE, DURACAO_MS } = require('../config/sessao');

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
  const poolQuebrado = { query: async () => { throw new Error('Table sessoes doesn\'t exist'); } };
  const erros = [];
  const original = console.error;
  console.error = (...a) => erros.push(a.join(' '));
  try {
    const armazem = criarArmazemSeguro(session, poolQuebrado, { NODE_ENV: 'development' });
    await new Promise((r) => setImmediate(r)); // deixa o teste da tabela falhar
    assert.ok(erros.some((e) => /sessoes/.test(e)), 'o erro claro foi para o console');
    // A sessao grava e le na reserva (memoria), sem lancar erro.
    await new Promise((ok, no) => armazem.set('abc', { cookie: { maxAge: 1000 }, usuario: 'x' }, (e) => (e ? no(e) : ok())));
    const lida = await new Promise((ok, no) => armazem.get('abc', (e, s) => (e ? no(e) : ok(s))));
    assert.strictEqual(lida.usuario, 'x');
    assert.ok(armazem.reserva instanceof session.MemoryStore);
    const producao = criarArmazemSeguro(session, poolQuebrado, { NODE_ENV: 'production' });
    assert.strictEqual(producao.reserva, null);
    await producao.principal.onReady(); await armazem.principal.onReady(); // so fecha depois de iniciar
    await producao.principal.close();
    await armazem.principal.close(); // encerra o temporizador do pacote, senao o teste nao termina
  } finally { console.error = original; }
});

test('a pagina de erro desenha sem usuario, mostrarCarrinho, aviso nem moeda (nao lanca erro)', async () => {
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'erro.ejs'), { titulo: 'Erro no servidor', mensagem: 'Algo deu errado.' });
  assert.match(html, /Erro no servidor/);
  assert.match(html, /Entrar/); // sem usuario: menu de visitante
});


