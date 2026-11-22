/**
 * tests/gestao-produtos.test.js
 * Testa visibilidade na vitrine, carrinho, edição e permissão. Sem rede e sem banco:
 * usamos um repositório falso que guarda os perfumes em memória.
 */
const test = require('node:test');
const assert = require('node:assert');
const Perfume = require('../domain/Perfume');
const { criarUsuario } = require('../domain/Usuario');
const VitrineService = require('../services/VitrineService');
const GestaoProdutosService = require('../services/GestaoProdutosService');
const CarrinhoService = require('../services/CarrinhoService');
const { ErroDeValidacao, ErroDePermissao } = require('../utils/erros');

/** Repositório falso: mesmos métodos do PerfumeRepository, com a mesma regra de "apenasVisiveis". */
function criarRepositorioFalso() {
  const lista = [
    new Perfume({ id: 1, nome: 'Rosa', marca: 'Alfa', preco: 100, estoque: 5, codigo_barras: '11111111', visivel: 1 }),
    new Perfume({ id: 2, nome: 'Lua', marca: 'Beta', preco: 200, estoque: 5, codigo_barras: '22222222', visivel: 1 })
  ];
  return {
    lista,
    listar: async (busca, { apenasVisiveis = false } = {}) => lista.filter((p) => !apenasVisiveis || p.visivel),
    contar: async (busca, { apenasVisiveis = false } = {}) => lista.filter((p) => !apenasVisiveis || p.visivel).length,
    listarMarcas: async ({ apenasVisiveis = false } = {}) =>
      [...new Set(lista.filter((p) => !apenasVisiveis || p.visivel).map((p) => p.marca))],
    buscarPorId: async (id) => lista.find((p) => p.id === id) || null,
    buscarPorCodigo: async (c) => lista.find((p) => p.codigoBarras === c) || null,
    atualizar: async (id, d) => Object.assign(lista.find((p) => p.id === id), d),
    definirVisivel: async (id, v) => { lista.find((p) => p.id === id).visivel = v; }
  };
}

const vendedor = criarUsuario({ id: 9, usuario: 'v', nome: 'V', papel: 'vendedor' });
const cliente = criarUsuario({ id: 8, usuario: 'c', nome: 'C', papel: 'cliente' });
const formulario = { nome: 'Rosa Nova', marca: 'Alfa', preco: '120,50', estoque: '3', descricao: '', codigo_barras: '', foto_url: '', visivel: 'on' };

test('produto oculto some da vitrine, mas continua na lista de quem vende', async () => {
  const repo = criarRepositorioFalso();
  const servico = new GestaoProdutosService(repo);
  await servico.definirVisibilidade(1, '0', vendedor);
  const vitrine = await new VitrineService(repo).vitrine({}, null); // a mesma base vista pelo comprador
  assert.deepStrictEqual(vitrine.cards.map((c) => c.id), [2]);
  assert.deepStrictEqual(vitrine.marcas, ['Beta']);
  assert.strictEqual((await servico.listar('', { incluirOcultos: true })).length, 2);
  assert.strictEqual((await servico.listar('')).length, 1); // o padrão esconde
});

test('produto oculto não entra no carrinho do site, mas entra na venda do balcão', async () => {
  const servico = new GestaoProdutosService(criarRepositorioFalso());
  await servico.definirVisibilidade(1, '0', vendedor);
  const carrinhos = new CarrinhoService(servico);
  const sessao = {};
  await assert.rejects(() => carrinhos.adicionar(sessao, 'carrinho', 1), ErroDeValidacao);
  await carrinhos.adicionar(sessao, 'venda', 1, { permitirOculto: true });
  assert.strictEqual((await carrinhos.carregar(sessao, 'venda', { permitirOculto: true })).itens.length, 1);
  // Item que ficou oculto depois de entrar no carrinho do site é ignorado.
  sessao.carrinho = { 1: 1 };
  assert.strictEqual((await carrinhos.carregar(sessao, 'carrinho')).itens.length, 0);
});

test('código de barras de outro produto dá erro; o do próprio produto é aceito', async () => {
  const servico = new GestaoProdutosService(criarRepositorioFalso());
  await assert.rejects(() => servico.atualizar(1, { ...formulario, codigo_barras: '22222222' }, vendedor), ErroDeValidacao);
  assert.strictEqual(await servico.atualizar(1, { ...formulario, codigo_barras: '11111111' }, vendedor), true);
});

test('editar salva os campos validados e a visibilidade', async () => {
  const repo = criarRepositorioFalso();
  const servico = new GestaoProdutosService(repo);
  await servico.atualizar(1, { ...formulario, visivel: undefined }, vendedor); // caixa desmarcada = oculto
  assert.strictEqual(repo.lista[0].nome, 'Rosa Nova');
  assert.strictEqual(repo.lista[0].preco, 120.5);
  assert.strictEqual(repo.lista[0].estoque, 3);
  assert.strictEqual(repo.lista[0].visivel, false);
  await assert.rejects(() => servico.atualizar(1, { ...formulario, preco: '-1' }, vendedor), ErroDeValidacao);
});

test('só quem pode gerenciar edita ou oculta (cliente é barrado)', async () => {
  const servico = new GestaoProdutosService(criarRepositorioFalso());
  assert.strictEqual(cliente.podeGerenciar(), false);
  assert.strictEqual(vendedor.podeGerenciar(), true);
  await assert.rejects(() => servico.atualizar(1, formulario, cliente), ErroDePermissao);
  await assert.rejects(() => servico.definirVisibilidade(1, '0', null), ErroDePermissao);
});
