/**
 * tests/ux-medias.test.js
 * Testa (sem rede e sem banco) as melhorias médias de UX:
 *  7) voltar para a página certa depois do login, SÓ com caminho interno (nada de //site ou https://site);
 *  8) comprovante da compra: só o dono vê; os outros recebem null (404);
 * 10) quantidade editável no carrinho, limitada ao estoque no servidor.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const ejs = require('ejs');
const Perfume = require('../domain/Perfume');
const { criarUsuario } = require('../domain/Usuario');
const CarrinhoService = require('../services/CarrinhoService');
const VendaService = require('../services/VendaService');
const AuthController = require('../controllers/AuthController');
const { exigirCliente } = require('../middlewares/auth');
const { caminhoInterno, caminhoDeVolta } = require('../utils/caminho');
const { ErroDeValidacao } = require('../utils/erros');

const ana = criarUsuario({ id: 1, usuario: 'ana', nome: 'Ana', papel: 'cliente' });
const bia = criarUsuario({ id: 2, usuario: 'bia', nome: 'Bia', papel: 'cliente' });
const vendedor = criarUsuario({ id: 3, usuario: 'v', nome: 'V', papel: 'vendedor' });

// ---------- 7) caminho de volta ----------

test('caminhoInterno: aceita só caminhos deste site; o resto vira a vitrine', () => {
  for (const bom of ['/carrinho', '/produto/7', '/?q=rosa&pagina=2', '/vendedor/produtos#produto-3']) {
    assert.strictEqual(caminhoInterno(bom), bom);
  }
  for (const ruim of ['//golpe.com', '/\\golpe.com', 'https://golpe.com', 'golpe.com', '', null, undefined, 42,
    '/ espaço', '/a\nb', '/login', '/login?x=1', '/cadastro', '/logout', '/' + 'x'.repeat(400)]) {
    assert.strictEqual(caminhoInterno(ruim), '/', String(ruim).slice(0, 30));
  }
  assert.strictEqual(caminhoInterno('/loginho'), '/loginho'); // só /login exato é bloqueado
});

test('caminhoDeVolta: GET usa o endereço pedido; POST usa a página de origem só se for deste site', () => {
  const pedido = (method, originalUrl, referer) => ({
    method, originalUrl, get: (h) => ({ referer, host: 'loja.test' })[h.toLowerCase()]
  });
  assert.strictEqual(caminhoDeVolta(pedido('GET', '/carrinho')), '/carrinho');
  assert.strictEqual(caminhoDeVolta(pedido('POST', '/carrinho/adicionar', 'http://loja.test/produto/7?x=1')), '/produto/7?x=1');
  assert.strictEqual(caminhoDeVolta(pedido('POST', '/carrinho/adicionar', 'https://golpe.com/produto/7')), null);
  assert.strictEqual(caminhoDeVolta(pedido('POST', '/carrinho/adicionar')), null);
});

test('barreira guarda o caminho e o login volta para ele (Vendedor nunca volta para o carrinho)', async () => {
  const sessao = {};
  exigirCliente({ usuario: null, session: sessao, method: 'GET', originalUrl: '/carrinho', get: () => '' }, { redirect: () => {} }, () => {});
  assert.strictEqual(sessao.voltarPara, '/carrinho');

  // Sessão falsa com regenerate (o login troca o id da sessão).
  const req = (voltarPara) => {
    const r = { body: { usuario: 'x', senha: 'y' }, session: { voltarPara } };
    r.session.regenerate = (cb) => { r.session = { regenerate: r.session.regenerate }; cb(); };
    return r;
  };
  const destino = async (usuario, voltarPara) => {
    let local = null;
    const controller = new AuthController({ entrar: async () => usuario });
    await controller.login(req(voltarPara), { redirect: (u) => { local = u; } });
    return local;
  };
  assert.strictEqual(await destino(ana, '/carrinho'), '/carrinho');
  assert.strictEqual(await destino(ana, '//golpe.com'), '/'); // mesmo se alguém gravasse lixo, não sai do site
  assert.strictEqual(await destino(vendedor, '/carrinho'), '/');
  assert.strictEqual(await destino(vendedor, '/produto/7'), '/produto/7');
  assert.strictEqual(await destino(ana, undefined), '/');
});

// ---------- 8) comprovante ----------

test('comprovante: só o dono vê; outro cliente, número inválido ou compra que não existe dão null', async () => {
  const repo = {
    buscarComItens: async (id) => (id === 10 ? {
      venda: { id: 10, cliente_id: 1, forma_pagamento: 'pix', subtotal: '200.00', desconto: '10.00', total: '190.00', criado_em: '2026-11-22T20:00:00Z' },
      itens: [{ quantidade: 2, preco_unitario: '100.00', nome: 'Anel', marca: 'Alfa', variacao: '16' }]
    } : null)
  };
  const servico = new VendaService(repo);
  const compra = await servico.comprovante('10', ana);
  assert.strictEqual(compra.forma, 'Pix');
  assert.deepStrictEqual(compra.linhas, [{ nome: 'Anel - 16', marca: 'Alfa', quantidade: 2, unitario: 100, subtotal: 200 }]);
  assert.deepStrictEqual([compra.subtotal, compra.desconto, compra.total], [200, 10, 190]);
  assert.strictEqual(await servico.comprovante('10', bia), null); // compra da Ana
  assert.strictEqual(await servico.comprovante('99', ana), null);
  assert.strictEqual(await servico.comprovante('abc', ana), null);
  assert.strictEqual(await servico.comprovante('10', null), null);

  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'compra.ejs'), {
    compra, usuario: ana, mostrarCarrinho: true, aviso: null, moeda: require('../utils/moeda')
  });
  assert.match(html, /Compra #10/);
  assert.match(html, /Total: R\$\s190,00/);
});

// ---------- 10) quantidade no carrinho ----------

test('quantidade no carrinho: troca (não soma), limitada ao estoque e validada no servidor', async () => {
  const perfume = new Perfume({ id: 1, nome: 'Rosa', marca: 'Alfa', preco: 50, estoque: 4, visivel: 1 });
  const servico = new CarrinhoService({ buscarPorId: async (id) => (Number(id) === 1 ? perfume : null) });
  const sessao = {};
  await servico.adicionar(sessao, 'carrinho', 1, { quantidade: '2' });
  await servico.definirQuantidade(sessao, 'carrinho', '1', { quantidade: '3' });
  assert.deepStrictEqual(sessao.carrinho, { 1: 3 }); // trocou 2 por 3
  await assert.rejects(() => servico.definirQuantidade(sessao, 'carrinho', '1', { quantidade: '5' }), /Só temos 4 em estoque/);
  for (const ruim of ['0', '-1', '1.5', 'abc']) {
    await assert.rejects(() => servico.definirQuantidade(sessao, 'carrinho', '1', { quantidade: ruim }), ErroDeValidacao, ruim);
  }
  await assert.rejects(() => servico.definirQuantidade(sessao, 'carrinho', '2', { quantidade: '1' }), /não está mais no carrinho/);
  assert.deepStrictEqual(sessao.carrinho, { 1: 3 }); // nada mudou com os pedidos ruins
  // O resumo leva o estoque, que vira o "max" do campo.
  const resumo = servico.resumir(await servico.carregar(sessao, 'carrinho'), ana);
  assert.strictEqual(resumo.linhas[0].estoque, 4);
});
