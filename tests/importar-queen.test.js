/**
 * tests/importar-queen.test.js
 * Testa a conversao Queen -> Perfume (centavos, variacoes, SKU, pontos) e a regra de nao duplicar.
 * Sem rede e sem banco: JSON pequeno de exemplo e repositorio falso em memoria.
 */
const test = require('node:test');
const assert = require('node:assert');
const { QueenConversor, ImportadorQueen } = require('../scripts/importar-queen');
const Perfume = require('../domain/Perfume');

// Peca simples: uma variacao so, preco em CENTAVOS (3000 = R$ 30,00), pontos na descricao.
const simples = {
  produto_referencia: '42905',
  produto_nome: '  Ping   Filho MENINA  Zircônia ',
  produto_descricao: '<p>500 Pontos</p>',
  produto_grupo_descricao: 'FILHOS E MAE DE PET',
  produto_imagens: ['http://x.com/a.jpg', 'https://img.exemplo.com/1.webp', 'https://img.exemplo.com/2.webp'],
  produto_estoque_total: 240,
  produto_ativo: 1,
  produto_variacoes: [{ variacao_descricao: '', variacao_preco: 3000, variacao_estoque: 240, variacao_ativo: 1 }]
};

// Peca com 2 variacoes ativas (uma sem descricao), 1 inativa e 1 sem preco: so as 2 primeiras valem.
const comVariacoes = {
  produto_referencia: '20274 - Ouro',
  produto_nome: 'Ping Placa Letra',
  produto_descricao: '<p>1.000 pontos n&atilde;o acompanha pingente</p>',
  produto_grupo_descricao: 'LETRAS',
  produto_imagens: ['https://img.exemplo.com/3.webp'],
  produto_estoque_total: 9,
  produto_ativo: 1,
  produto_variacoes: [
    { variacao_descricao: 'B', variacao_preco: 6000, variacao_estoque: 2, variacao_ativo: 1 },
    { variacao_descricao: '', variacao_preco: 4550, variacao_estoque: 7, variacao_ativo: 1 },
    { variacao_descricao: 'C', variacao_preco: 5000, variacao_estoque: 5, variacao_ativo: 0 },
    { variacao_descricao: 'D', variacao_preco: 0, variacao_estoque: 5, variacao_ativo: 1 }
  ]
};

test('peca simples: preco em centavos vira reais, SKU, pontos, foto https e codigo de barras NULL', () => {
  const p = new QueenConversor().converter(simples);
  assert.strictEqual(p.nome, 'Ping Filho MENINA Zircônia'); // espacos das pontas e duplos limpos
  assert.strictEqual(p.marca, 'Queen Semijoias');
  assert.strictEqual(p.preco, 30);
  assert.strictEqual(p.estoque, 240);
  assert.strictEqual(p.sku, '42905');
  assert.strictEqual(p.pontos, 500);
  assert.strictEqual(p.codigoBarras, null);
  assert.strictEqual(p.fotoUrl, 'https://img.exemplo.com/1.webp'); // pula a imagem http
  assert.strictEqual(p.descricao, 'Categoria: FILHOS E MAE DE PET'); // "500 Pontos" saiu do texto; sobrou so a categoria
  assert.strictEqual(p.variacoes.length, 0); // uma variacao so: preco e estoque ficam no produto
  assert.strictEqual(p.visivel, true);
});

test('peca com 2 variacoes ativas: variacoes com preco em centavos, "Opcao N" para vazia, produto = menor preco e soma', () => {
  const p = new QueenConversor().converter(comVariacoes);
  assert.deepStrictEqual(p.variacoes.map((v) => [v.descricao, v.preco, v.estoque]), [['B', 60, 2], ['Opção 2', 45.5, 7]]);
  assert.strictEqual(p.preco, 45.5);
  assert.strictEqual(p.estoque, 9);
  assert.strictEqual(p.pontos, 1000); // "1.000" com ponto de milhar
  assert.strictEqual(p.descricao, 'Categoria: LETRAS. não acompanha pingente');
  assert.strictEqual(p.temVariacoes(), true);
});

test('sem a palavra "pontos" fica NULL; produto sem variacao valida ou sem nome e invalido; estoque nunca negativo', () => {
  const c = new QueenConversor();
  assert.strictEqual(c.converter({ ...simples, produto_descricao: '<p>Prata 925</p>' }).pontos, null);
  assert.strictEqual(c.converter({ ...simples, produto_descricao: '<p>Prata 925</p>' }).descricao, 'Categoria: FILHOS E MAE DE PET. Prata 925');
  assert.strictEqual(c.converter({ ...simples, produto_variacoes: [{ variacao_preco: 0, variacao_ativo: 1 }] }), null);
  assert.strictEqual(c.converter({ ...simples, produto_variacoes: [{ variacao_preco: 100, variacao_ativo: 0 }] }), null);
  assert.strictEqual(c.converter({ ...simples, produto_nome: '   ' }), null);
  assert.strictEqual(c.converter({ ...simples, produto_variacoes: [{ variacao_preco: 100, variacao_estoque: -4, variacao_ativo: 1 }] }).estoque, 0);
});

/** Repositorio falso em memoria (mesmos metodos que o importador usa). */
function criarRepositorioFalso() {
  const produtos = [];
  return {
    produtos,
    buscarPorSku: async (sku) => produtos.find((p) => p.sku === sku) || null,
    buscarPorNomeEMarca: async (n, m) => produtos.find((p) => p.nome === n && p.marca === m) || null,
    buscarPorCodigo: async () => null,
    criar: async (perfume) => { produtos.push({ ...perfume, id: produtos.length + 1, variacoesGravadas: [], sincronizado: false }); return produtos.length; },
    criarVariacao: async (id, v) => { produtos[id - 1].variacoesGravadas.push(v); },
    sincronizarComVariacoes: async (id) => { produtos[id - 1].sincronizado = true; }
  };
}

test('importar duas vezes nao duplica (chave = SKU); variacoes sao gravadas e o produto sincronizado', async () => {
  const repo = criarRepositorioFalso();
  const importador = new ImportadorQueen(repo);
  const r1 = await importador.importar([simples, comVariacoes, { produto_nome: '' }]);
  const r2 = await importador.importar([simples, comVariacoes]);
  assert.deepStrictEqual(r1, { importados: 2, pulados: 0, invalidos: 1 });
  assert.deepStrictEqual(r2, { importados: 0, pulados: 2, invalidos: 0 });
  assert.strictEqual(repo.produtos.length, 2);
  assert.deepStrictEqual(repo.produtos[1].variacoesGravadas.map((v) => [v.descricao, v.preco, v.estoque]), [['B', 60, 2], ['Opção 2', 45.5, 7]]);
  assert.strictEqual(repo.produtos[1].sincronizado, true);
  assert.strictEqual(repo.produtos[0].sincronizado, false); // sem variacao: nada a sincronizar
});

test('mesmo nome com SKU diferente nao e pulado (a chave e o SKU, nao o nome)', async () => {
  const repo = criarRepositorioFalso();
  const importador = new ImportadorQueen(repo);
  const r = await importador.importar([simples, { ...simples, produto_referencia: '99999' }]);
  assert.strictEqual(r.importados, 2);
});

test('pontos so existem na marca Queen (regra do dominio)', () => {
  const p = new QueenConversor().converter(simples);
  assert.strictEqual(new Perfume({ ...p, marca: 'Outra', pontos: p.pontos, id: 1 }).pontos, null);
});
