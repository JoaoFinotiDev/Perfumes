/**
 * tests/login-e-papeis.test.js
 * Testa SEM rede externa e SEM banco:
 *  1) login: senha errada e usuário que não existe dão a MESMA mensagem; usuário repetido no cadastro é recusado;
 *  2) bloqueio por papel nas rotas de verdade (routes/*.js): visitante vai para o login e papel errado leva 403.
 *     Sobe um Express de teste só em 127.0.0.1, com sessão falsa; a barreira barra ANTES de chegar no banco.
 *  3) busca por código de barras: falha das bases vira 503 (o navegador pode tentar de novo).
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const express = require('express');
const bcrypt = require('bcryptjs');
const AuthService = require('../services/AuthService');
const AuthController = require('../controllers/AuthController');
const ProdutoApiController = require('../controllers/ProdutoApiController');
const { carregarUsuario } = require('../middlewares/auth');
const { PAPEIS } = require('../domain/Usuario');
const { ErroDeValidacao } = require('../utils/erros');

/** Repositório falso de usuários: "ana" com senha "senha123"; criar "ana" de novo dá chave repetida. */
function criarRepositorio() {
  const hash = bcrypt.hashSync('senha123', 4); // custo baixo: o teste fica rápido
  const linhas = [{ id: 1, usuario: 'ana', nome: 'Ana', papel: PAPEIS.CLIENTE, senha_hash: hash }];
  return {
    buscarLinhaPorUsuario: async (u) => linhas.find((l) => l.usuario === u),
    criar: async (novo) => {
      if (linhas.some((l) => l.usuario === novo.usuario)) {
        throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }); // o que o MySQL manda
      }
      linhas.push({ ...novo, id: linhas.length + 1 });
      return linhas.length;
    }
  };
}

test('login: senha certa entra como Cliente; senha errada e usuário inexistente dão a mesma mensagem', async () => {
  const auth = new AuthService(criarRepositorio());
  const ana = await auth.entrar('  ANA ', 'senha123'); // espaços e maiúsculas não importam no usuário
  assert.strictEqual(ana.ehCliente(), true);
  await assert.rejects(() => auth.entrar('ana', 'errada'), { name: 'ErroDeValidacao', message: 'Usuário ou senha inválidos.' });
  await assert.rejects(() => auth.entrar('ninguem', 'senha123'), { message: 'Usuário ou senha inválidos.' });
  await assert.rejects(() => auth.entrar('', ''), ErroDeValidacao);
});

test('cadastro: usuário repetido é recusado com mensagem clara', async () => {
  const auth = new AuthService(criarRepositorio());
  await assert.rejects(() => auth.cadastrarCliente({ usuario: 'ana', nome: 'Outra Ana', senha: 'senha123' }), /já existe/);
  assert.strictEqual(await auth.cadastrarCliente({ usuario: 'bia', nome: 'Bia', senha: 'senha123' }), 2);
});

test('controller de login: senha errada responde 401 e mantém o usuário digitado', async () => {
  const controller = new AuthController(new AuthService(criarRepositorio()));
  const res = { codigo: 200, status(c) { this.codigo = c; return this; }, render(v, d) { this.view = v; this.dados = d; } };
  await controller.login({ body: { usuario: 'ana', senha: 'x' }, session: {} }, res);
  assert.strictEqual(res.codigo, 401);
  assert.strictEqual(res.view, 'login');
  assert.strictEqual(res.dados.form.usuario, 'ana');
});

/** Express de teste com as rotas de verdade e uma sessão falsa escolhida pelo cabeçalho "x-papel". */
async function subirApp() {
  const app = express();
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('view engine', 'ejs');
  app.use((req, res, next) => {
    const papel = req.get('x-papel');
    req.session = papel ? { usuario: { id: 9, usuario: 'u', nome: 'U', papel } } : {};
    next();
  });
  app.use(carregarUsuario);
  // Mesma ordem do app.js.
  app.use('/', require('../routes/index'));
  app.use('/', require('../routes/produtos'));
  app.use('/', require('../routes/vendedor'));
  app.use('/', require('../routes/admin'));
  const servidor = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  return { servidor, base: `http://127.0.0.1:${servidor.address().port}` };
}

test('rotas: cada papel só entra onde pode (visitante -> login, papel errado -> 403)', async () => {
  const { servidor, base } = await subirApp();
  // [método, caminho, papel, status esperado]. Só casos que a barreira decide (nenhum chega no banco).
  const casos = [
    ['GET', '/itens', null, 302], ['GET', '/itens', PAPEIS.CLIENTE, 403],
    ['POST', '/itens', PAPEIS.CLIENTE, 403], ['POST', '/itens', PAPEIS.ADMIN, 403],
    ['GET', '/carrinho', null, 302], ['GET', '/carrinho', PAPEIS.VENDEDOR, 403], ['GET', '/carrinho', PAPEIS.ADMIN, 403],
    ['GET', '/vendedor/venda', null, 302], ['GET', '/vendedor/venda', PAPEIS.CLIENTE, 403], ['GET', '/vendedor/venda', PAPEIS.ADMIN, 403],
    ['GET', '/vendedor/produtos', null, 302], ['GET', '/vendedor/produtos', PAPEIS.CLIENTE, 403],
    ['POST', '/vendedor/produtos/1/variacoes/1/ativo', PAPEIS.CLIENTE, 403],
    ['GET', '/admin', null, 302], ['GET', '/admin', PAPEIS.CLIENTE, 403], ['GET', '/admin', PAPEIS.VENDEDOR, 403],
    ['POST', '/admin/vendedores', PAPEIS.VENDEDOR, 403],
    ['GET', '/api/produto-por-codigo/7891234567890', PAPEIS.CLIENTE, 403]
  ];
  try {
    for (const [metodo, caminho, papel, esperado] of casos) {
      const r = await fetch(base + caminho, { method: metodo, redirect: 'manual', headers: papel ? { 'x-papel': papel } : {} });
      assert.strictEqual(r.status, esperado, `${metodo} ${caminho} como ${papel || 'visitante'}`);
      if (esperado === 302) assert.strictEqual(r.headers.get('location'), '/login');
    }
  } finally {
    servidor.close();
  }
});

test('código de barras: bases fora do ar -> 503; não achou -> encontrado false; código inválido -> 400', async () => {
  const res = () => ({ codigo: 200, status(c) { this.codigo = c; return this; }, json(d) { this.corpo = d; } });
  const avisoOriginal = console.error;
  console.error = () => {}; // o controller registra a falha no console; aqui não precisa aparecer
  try {
    const falhou = res();
    await new ProdutoApiController({ buscar: async () => { throw new Error('rede'); } }).porCodigo({ params: { codigo: '7891234567890' } }, falhou);
    assert.strictEqual(falhou.codigo, 503);
    const naoAchou = res();
    await new ProdutoApiController({ buscar: async () => null }).porCodigo({ params: { codigo: '7891234567890' } }, naoAchou);
    assert.deepStrictEqual([naoAchou.codigo, naoAchou.corpo], [200, { encontrado: false }]);
    const invalido = res();
    await new ProdutoApiController({ buscar: async () => null }).porCodigo({ params: { codigo: 'abc' } }, invalido);
    assert.strictEqual(invalido.codigo, 400);
  } finally {
    console.error = avisoOriginal;
  }
});
