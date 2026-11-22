/**
 * tests/e2e.js
 * Teste de ponta a ponta (precisa do MySQL com o script.sql rodado e do servidor no ar).
 * Uso: node tests/e2e.js [http://localhost:3000]
 * Cria usuários com nome único e faz vendas de verdade no banco configurado no .env.
 */
const base = process.argv[2] || 'http://localhost:3000';
let falhas = 0;

/** Navegador mínimo: guarda o cookie de sessão entre chamadas. */
function criarNavegador() {
  let cookie = '';
  return async (caminho, { metodo = 'GET', corpo } = {}) => {
    const r = await fetch(base + caminho, {
      method: metodo, redirect: 'manual',
      headers: { cookie, ...(corpo ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: corpo ? new URLSearchParams(corpo).toString() : undefined
    });
    const novo = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    if (novo) cookie = novo;
    return { status: r.status, local: r.headers.get('location'), texto: await r.text() };
  };
}

function conferir(nome, ok, extra = '') {
  if (!ok) falhas++;
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome} ${ok ? '' : extra}`);
}

(async () => {
  const id = Date.now().toString().slice(-8);
  const visitante = criarNavegador();
  const admin = criarNavegador();
  const vendedor = criarNavegador();
  const cliente = criarNavegador();

  // Catálogo público e busca
  let r = await visitante('/itens');
  conferir('GET /itens lista perfumes (público)', r.status === 200 && r.texto.includes('Malbec Tradicional'));
  conferir('acentos corretos (UTF-8)', r.texto.includes('O Boticário'));
  r = await visitante('/itens?q=natura');
  conferir('busca por marca', r.texto.includes('Kaiak') && !r.texto.includes('Malbec'));

  // Papel checado no servidor
  r = await visitante('/vendedor/venda');
  conferir('visitante não abre venda (redireciona p/ login)', r.status === 302 && r.local === '/login');
  r = await visitante('/itens', { metodo: 'POST', corpo: { nome: 'x' } });
  conferir('visitante não faz POST /itens', r.status === 302 && r.local === '/login');
  r = await visitante('/admin');
  conferir('visitante não vê /admin', r.status === 302);

  // Admin
  r = await admin('/login', { metodo: 'POST', corpo: { usuario: 'admin', senha: 'admin' } });
  conferir('login admin/admin', r.status === 302 && r.local === '/itens');
  r = await admin('/admin/vendedores', { metodo: 'POST', corpo: { nome: 'Vend Teste', usuario: 'vend' + id, senha: 'senha123' } });
  conferir('admin cria vendedor', r.status === 302 && r.local === '/admin');
  r = await admin('/vendedor/venda');
  conferir('admin NÃO abre venda (403)', r.status === 403);
  r = await admin('/admin/vendedores', { metodo: 'POST', corpo: { nome: 'x', usuario: 'vend' + id, senha: 'senha123' } });
  conferir('vendedor duplicado é recusado (400)', r.status === 400);

  // Cliente se cadastra
  r = await cliente('/cadastro', { metodo: 'POST', corpo: { nome: 'Cli Teste', usuario: 'cli' + id, senha: 'senha123' } });
  conferir('cliente se cadastra e entra', r.status === 302);
  r = await cliente('/itens');
  conferir('cliente vê preço com 5% (189,90 -> 180,41)', r.texto.includes('180,41'), '');
  r = await cliente('/admin');
  conferir('cliente NÃO vê /admin (403)', r.status === 403);
  r = await cliente('/vendedor/venda');
  conferir('cliente NÃO abre venda (403)', r.status === 403);
  r = await cliente('/itens', { metodo: 'POST', corpo: { nome: 'x', marca: 'y', preco: '1', estoque: '1' } });
  conferir('cliente NÃO faz POST /itens (403)', r.status === 403);

  // Carrinho do cliente
  await cliente('/carrinho/adicionar', { metodo: 'POST', corpo: { perfumeId: '1' } });
  r = await cliente('/carrinho');
  conferir('carrinho: 189,90 - 5% = 180,41', r.texto.includes('180,41'));
  r = await cliente('/carrinho/finalizar', { metodo: 'POST', corpo: { forma: 'pix' } });
  conferir('cliente finaliza compra simulada', r.status === 302 && r.local === '/itens');
  r = await visitante('/carrinho/finalizar', { metodo: 'POST', corpo: { forma: 'pix' } });
  conferir('visitante não finaliza compra', r.status === 302 && r.local === '/login');

  // Vendedor
  r = await vendedor('/login', { metodo: 'POST', corpo: { usuario: 'vend' + id, senha: 'senha123' } });
  conferir('login vendedor', r.status === 302);
  r = await vendedor('/itens', { metodo: 'POST', corpo: { nome: 'Perfume <b>Teste</b>', marca: 'Marca', preco: '99,90', estoque: '5', descricao: 'd', codigo_barras: '789' + id, foto_url: '' } });
  conferir('POST /itens (vendedor) grava e redireciona', r.status === 302 && r.local === '/itens', r.texto.slice(0, 200));
  r = await vendedor('/itens');
  conferir('saída escapada no EJS', r.texto.includes('&lt;b&gt;Teste') && !r.texto.includes('<b>Teste'));
  r = await vendedor('/itens', { metodo: 'POST', corpo: { nome: 'a', marca: 'b', preco: '-1', estoque: 'x' } });
  conferir('POST /itens inválido -> 400', r.status === 400);
  r = await vendedor('/itens', { metodo: 'POST', corpo: { nome: 'Dup', marca: 'Marca', preco: '10', estoque: '1', codigo_barras: '789' + id } });
  conferir('código de barras repetido -> 400', r.status === 400);
  r = await vendedor('/api/produto-por-codigo/abc');
  conferir('API com código inválido -> 400', r.status === 400);
  r = await vendedor('/api/produto-por-codigo/0000000000000');
  conferir('API com código desconhecido não quebra', r.status === 200 && r.texto.includes('"encontrado"'), r.texto);
  console.log('     (API respondeu:', r.texto.trim(), ')');

  // Abrir venda
  r = await vendedor('/vendedor/venda/codigo', { metodo: 'POST', corpo: { codigo: '1234567890123' } });
  r = await vendedor('/vendedor/venda');
  conferir('código inexistente mostra "Produto não encontrado"', r.texto.includes('Produto não encontrado'));
  await vendedor('/vendedor/venda/codigo', { metodo: 'POST', corpo: { codigo: '7891033000011' } });
  r = await vendedor('/vendedor/venda');
  conferir('bipar código existente adiciona (sem cliente = 189,90)', r.texto.includes('Total: R$') && r.texto.includes('189,90'));
  r = await vendedor('/vendedor/venda?q=floratta');
  conferir('busca por nome na venda', r.texto.includes('Floratta Rose'));
  const listaClientes = r.texto.match(/<option value="(\d+)"[^>]*>Cli Teste/);
  conferir('cliente cadastrado aparece na lista', !!listaClientes);
  await vendedor('/vendedor/venda/cliente', { metodo: 'POST', corpo: { clienteId: listaClientes[1] } });
  r = await vendedor('/vendedor/venda');
  conferir('com cliente aplica 5% (total 180,41)', r.texto.includes('180,41') && r.texto.includes('desconto de 5%'));
  r = await vendedor('/vendedor/venda/finalizar', { metodo: 'POST', corpo: { forma: 'invalida' } });
  conferir('forma de pagamento inválida -> 400', r.status === 400);
  r = await vendedor('/vendedor/venda/finalizar', { metodo: 'POST', corpo: { forma: 'dinheiro' } });
  conferir('finaliza venda', r.status === 302);
  r = await vendedor('/vendedor/venda');
  conferir('venda finalizada limpa a tela', r.texto.includes('Nenhum item ainda') && r.texto.includes('finalizada'));

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
  process.exit(falhas ? 1 : 0);
})();
