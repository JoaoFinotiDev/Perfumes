/**
 * tests/dominio.test.js
 * Testes das regras que não precisam de banco: desconto por papel, carrinho,
 * venda e cadeia de buscadores. Rode com: npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const Perfume = require('../domain/Perfume');
const Carrinho = require('../domain/Carrinho');
const { Venda } = require('../domain/Venda');
const { criarUsuario } = require('../domain/Usuario');
const BuscadorEmCadeia = require('../buscadores/BuscadorEmCadeia');

const perfume = new Perfume({ id: 1, nome: 'X', marca: 'Y', preco: 100, estoque: 3 });
const cliente = criarUsuario({ id: 1, usuario: 'c', nome: 'C', papel: 'cliente' });
const vendedor = criarUsuario({ id: 2, usuario: 'v', nome: 'V', papel: 'vendedor' });

test('cliente paga 5% a menos; vendedor e visitante pagam cheio', () => {
  assert.strictEqual(perfume.precoPara(cliente), 95);
  assert.strictEqual(perfume.precoPara(vendedor), 100);
  assert.strictEqual(perfume.precoPara(null), 100);
});

// Arredondamento em centavos: 9.595 e 123.405 caem em "meio centavo" e devem subir.
test('arredondar sobe o meio centavo corretamente', () => {
  const { arredondar } = require('../domain/Desconto');
  assert.strictEqual(arredondar(9.595), 9.6);
  assert.strictEqual(arredondar(123.405), 123.41);
});

// Id que nao e inteiro positivo nao vai ao banco: devolve null.
test('PerfumeService.buscarPorId devolve null para id invalido', () => {
  const PerfumeService = require('../services/PerfumeService');
  const servico = new PerfumeService({ buscarPorId: () => { throw new Error('nao devia consultar'); } });
  ['abc', '', 0, -3, 1.5, NaN].forEach((id) => assert.strictEqual(servico.buscarPorId(id), null));
});

// O repositorio lanca erro proprio; o service troca por ErroDeValidacao (mensagem para o usuario).
test('VendaService converte EstoqueInsuficienteError em ErroDeValidacao', async () => {
  const VendaService = require('../services/VendaService');
  const { ErroDeValidacao, EstoqueInsuficienteError } = require('../utils/erros');
  const servico = new VendaService({ registrar: async () => { throw new EstoqueInsuficienteError('X'); } });
  const c = new Carrinho();
  c.adicionar(perfume, 1);
  await assert.rejects(() => servico.finalizar({ carrinho: c, forma: 'pix' }), ErroDeValidacao);
});

test('carrinho não passa do estoque', () => {
  const c = new Carrinho();
  c.adicionar(perfume, 3);
  // Já tem 3 no carrinho e o estoque é 3: a mensagem diz quantas já estão no carrinho.
  assert.throws(() => c.adicionar(perfume, 1), /Você já tem 3 de "X" no carrinho e só temos 3 em estoque\./);
});

test('aviso de estoque: sem nada no carrinho só diz o estoque; esgotado diz esgotado', () => {
  const c = new Carrinho();
  assert.throws(() => c.adicionar(perfume, 5), /só temos 3 em estoque/);
  const esgotado = new Perfume({ id: 2, nome: 'Z', marca: 'Y', preco: 10, estoque: 0 });
  assert.throws(() => c.adicionar(esgotado, 1), /produto esgotado/);
});

test('venda com cliente aplica 5%, sem cliente é preço cheio', () => {
  const c = new Carrinho();
  c.adicionar(perfume, 2);
  assert.strictEqual(new Venda({ carrinho: c, cliente, forma: 'pix' }).total, 190);
  assert.strictEqual(new Venda({ carrinho: c, cliente: null, forma: 'pix' }).total, 200);
  assert.throws(() => new Venda({ carrinho: c, forma: 'cheque' }), /pagamento/);
});

test('cadeia: usa o segundo buscador e ignora falhas do primeiro', async () => {
  const quebrado = { buscar: async () => { throw new Error('rede'); } };
  const bom = { buscar: async () => ({ nome: 'A', marca: 'B', foto: '' }) };
  assert.deepStrictEqual(await new BuscadorEmCadeia([quebrado, bom]).buscar('1'), { nome: 'A', marca: 'B', descricao: '', foto: '' });
  // Ninguém achou e alguém FALHOU: lança (falhar não é "não existe"; o cache não pode guardar isso).
  await assert.rejects(() => new BuscadorEmCadeia([quebrado]).buscar('1'), /rede/);
  // Todos responderam "não achei": aí sim é null.
  assert.strictEqual(await new BuscadorEmCadeia([{ buscar: async () => null }]).buscar('1'), null);
});

test('cache: falha da API NÃO é guardada (a próxima busca tenta de novo); "não achou" é guardado', async () => {
  const BuscadorComCache = require('../buscadores/BuscadorComCache');
  let chamadas = 0;
  const instavel = { buscar: async () => { chamadas++; if (chamadas === 1) throw new Error('rede'); return null; } };
  const cache = new BuscadorComCache(instavel);
  await assert.rejects(() => cache.buscar('789'), /rede/);
  assert.strictEqual(await cache.buscar('789'), null); // tentou de novo (2ª chamada) e guardou o "não achou"
  assert.strictEqual(await cache.buscar('789'), null); // agora vem do cache
  assert.strictEqual(chamadas, 2);
});

test('cadeia: o segundo buscador completa os campos que o primeiro deixou vazios', async () => {
  const semMarca = { buscar: async () => ({ nome: 'Perfume X', marca: '', descricao: '', foto: 'f.jpg' }) };
  const comMarca = { buscar: async () => ({ nome: 'Outro nome', marca: 'Outra Marca', descricao: 'Eau de parfum', foto: '' }) };
  assert.deepStrictEqual(
    await new BuscadorEmCadeia([semMarca, comMarca]).buscar('1'),
    { nome: 'Perfume X', marca: 'Outra Marca', descricao: 'Eau de parfum', foto: 'f.jpg' } // o nome do primeiro é mantido
  );
});

test('cache: o mesmo código só chama a API uma vez, mesmo ao mesmo tempo', async () => {
  const BuscadorComCache = require('../buscadores/BuscadorComCache');
  let chamadas = 0;
  const contador = { buscar: async () => { chamadas++; return { nome: 'A', marca: '', descricao: '', foto: '' }; } };
  const cache = new BuscadorComCache(contador);
  await Promise.all([cache.buscar('123'), cache.buscar('123')]); // duas ao mesmo tempo
  await cache.buscar('123'); // e mais uma depois
  assert.strictEqual(chamadas, 1);
});

// Vitrine: preço com desconto vem da estratégia do usuário; foto só aceita http/https; ordem inválida vira "nome".
test('VitrineService.vitrine monta cards com desconto, foto segura e esgotado', async () => {
  const VitrineService = require('../services/VitrineService');
  let ordemUsada;
  const repo = {
    listar: async (busca, { ordem }) => {
      ordemUsada = ordem;
      return [
        new Perfume({ id: 1, nome: 'A', marca: 'M', preco: 100, estoque: 2, foto_url: 'javascript:alert(1)' }),
        new Perfume({ id: 2, nome: 'B', marca: 'M', preco: 50, estoque: 0, foto_url: 'https://x.com/a.jpg' })
      ];
    },
    contar: async () => 2,
    listarMarcas: async () => ['M']
  };
  const servico = new VitrineService(repo);
  const comCliente = await servico.vitrine({ ordem: 'preco; --' }, cliente);
  assert.strictEqual(ordemUsada, 'nome');
  assert.strictEqual(comCliente.cards[0].precoFinal, 95);
  assert.strictEqual(comCliente.cards[0].temDesconto, true);
  assert.strictEqual(comCliente.cards[0].percentual, 5);
  assert.strictEqual(comCliente.cards[0].fotoUrl, null);
  assert.strictEqual(comCliente.cards[1].fotoUrl, 'https://x.com/a.jpg');
  assert.strictEqual(comCliente.cards[1].esgotado, true);
  assert.strictEqual(comCliente.cards[1].estoque, 0); // esgotado mostra 0, nunca negativo
  const visitante = await servico.vitrine({}, null);
  assert.strictEqual(visitante.cards[0].precoFinal, 100);
  assert.strictEqual(visitante.cards[0].temDesconto, false);
});
