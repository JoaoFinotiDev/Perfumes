/**
 * tests/ux-rapidas.test.js
 * Testa (sem rede e sem banco) as melhorias rápidas de UX:
 *  - aviso de ERRO vai em caixa vermelha com role="alert"; sucesso em verde com role="status";
 *  - o middleware lê e APAGA o tipo do aviso (mostra uma vez só);
 *  - o carrinho mostra "Você economizou" com o desconto calculado no service (e "Continuar comprando");
 *  - tabelas dentro da caixa com rolagem lateral; formulários com autocomplete.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const ejs = require('ejs');
const Perfume = require('../domain/Perfume');
const Carrinho = require('../domain/Carrinho');
const { criarUsuario } = require('../domain/Usuario');
const CarrinhoService = require('../services/CarrinhoService');
const { carregarUsuario, exigirCliente } = require('../middlewares/auth');
const { avisarErro } = require('../utils/aviso');
const moeda = require('../utils/moeda');

const views = path.join(__dirname, '..', 'views');
const cliente = criarUsuario({ id: 1, usuario: 'c', nome: 'C', papel: 'cliente' });
const base = { usuario: null, mostrarCarrinho: true, moeda, percentualDesconto: 0, percentualCliente: 5, erro: null, form: {} };

test('aviso: erro fica marcado; o middleware entrega o tipo para a view e apaga os dois campos', () => {
  const sessao = {};
  avisarErro(sessao, 'Estoque insuficiente');
  assert.deepStrictEqual(sessao, { aviso: 'Estoque insuficiente', avisoErro: true });
  const res = { locals: {} };
  carregarUsuario({ session: sessao }, res, () => {});
  assert.strictEqual(res.locals.aviso, 'Estoque insuficiente');
  assert.strictEqual(res.locals.avisoErro, true);
  assert.deepStrictEqual(sessao, {}); // mostrado uma vez só
  // Aviso de sucesso (texto simples) continua verde.
  const res2 = { locals: {} };
  carregarUsuario({ session: { aviso: 'Produto atualizado.' } }, res2, () => {});
  assert.strictEqual(res2.locals.avisoErro, false);
});

test('aviso: quem é barrado (login exigido) recebe o aviso como ERRO', () => {
  const sessao = {};
  exigirCliente({ usuario: null, session: sessao }, { redirect: () => {} }, () => {});
  assert.strictEqual(sessao.avisoErro, true);
});

test('topo.ejs: erro = caixa vermelha role="alert"; sucesso = verde role="status"', async () => {
  const erro = await ejs.renderFile(path.join(views, 'login.ejs'), { ...base, aviso: 'Entre para continuar.', avisoErro: true });
  assert.match(erro, /<p class="erro" role="alert">Entre para continuar\.<\/p>/);
  const ok = await ejs.renderFile(path.join(views, 'login.ejs'), { ...base, aviso: 'Vendedor criado.', avisoErro: false });
  assert.match(ok, /<p class="aviso" role="status">Vendedor criado\.<\/p>/);
  // Login com autocomplete certo.
  assert.match(erro, /autocomplete="username"/);
  assert.match(erro, /autocomplete="current-password"/);
});

test('carrinho: economia vem pronta do service; a view mostra "Você economizou" e "Continuar comprando"', async () => {
  const perfume = new Perfume({ id: 1, nome: 'X', marca: 'Y', preco: 100, estoque: 5 });
  const carrinho = new Carrinho();
  carrinho.adicionar(perfume, 2);
  const servico = new CarrinhoService({});
  const resumo = servico.resumir(carrinho, cliente);
  assert.deepStrictEqual([resumo.subtotal, resumo.desconto, resumo.total, resumo.temDesconto], [200, 10, 190, true]);
  const semDesconto = servico.resumir(carrinho, null); // venda sem cliente: nada economizado
  assert.deepStrictEqual([semDesconto.desconto, semDesconto.temDesconto], [0, false]);

  const html = await ejs.renderFile(path.join(views, 'carrinho.ejs'), { ...base, usuario: cliente, aviso: null, resumo, formas: { pix: 'Pix' } });
  assert.match(html, /Você economizou R\$\s10,00 nesta compra\./);
  assert.match(html, /Continuar comprando/);
  assert.match(html, /<div class="tabela-rolagem">\s*<table>/);
  const htmlSem = await ejs.renderFile(path.join(views, 'carrinho.ejs'), { ...base, aviso: null, resumo: semDesconto, formas: { pix: 'Pix' } });
  assert.ok(!htmlSem.includes('Você economizou'));
});

test('cadastro: senha nova com autocomplete e dica ligada ao campo', async () => {
  const html = await ejs.renderFile(path.join(views, 'cadastro.ejs'), { ...base, aviso: null });
  assert.match(html, /autocomplete="new-password" aria-describedby="dica-senha"/);
  assert.match(html, /id="dica-senha"/);
});
