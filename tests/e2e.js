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
  let r = await visitante('/');
  conferir('GET / (vitrine) lista perfumes (público)', r.status === 200 && r.texto.includes('Malbec Tradicional'));
  conferir('acentos corretos (UTF-8)', r.texto.includes('O Boticário'));
  r = await visitante('/?q=natura');
  conferir('busca por marca', r.texto.includes('Kaiak') && !r.texto.includes('Malbec'));
  r = await visitante('/itens');
  conferir('visitante NÃO vê /itens (vai para o login)', r.status === 302 && r.local === '/login');

  // Papel checado no servidor
  r = await visitante('/vendedor/venda');
  conferir('visitante não abre venda (redireciona p/ login)', r.status === 302 && r.local === '/login');
  r = await visitante('/itens', { metodo: 'POST', corpo: { nome: 'x' } });
  conferir('visitante não faz POST /itens', r.status === 302 && r.local === '/login');
  r = await visitante('/admin');
  conferir('visitante não vê /admin', r.status === 302);

  // Admin
  r = await admin('/login', { metodo: 'POST', corpo: { usuario: 'admin', senha: 'admin' } });
  conferir('login admin/admin', r.status === 302 && r.local === '/');
  r = await admin('/itens');
  conferir('admin vê /itens com a coluna "Na vitrine"', r.status === 200 && r.texto.includes('Malbec Tradicional') && r.texto.includes('Na vitrine'));
  conferir('/itens: descrição em uma linha com botão "Ver mais" (escondido até o JS medir)',
    r.texto.includes('class="desc-texto"') && /<button[^>]*desc-botao[^>]*hidden[^>]*aria-expanded="false"/.test(r.texto) && r.texto.includes('descricao-ver-mais.js'));
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
  conferir('cliente NÃO vê /itens (403)', r.status === 403);
  r = await cliente('/');
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
  conferir('cliente finaliza compra simulada', r.status === 302 && r.local === '/');
  r = await visitante('/carrinho/finalizar', { metodo: 'POST', corpo: { forma: 'pix' } });
  conferir('visitante não finaliza compra', r.status === 302 && r.local === '/login');
  r = await visitante('/carrinho/adicionar', { metodo: 'POST', corpo: { perfumeId: '1' } });
  conferir('visitante que adiciona ao carrinho vai para o login', r.status === 302 && r.local === '/login');
  r = await admin('/carrinho');
  conferir('admin NÃO usa o carrinho (403)', r.status === 403);
  r = await visitante('/api/produtos?todos=1');
  conferir('API de produtos: visitante não pede ocultos (403)', r.status === 403);

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
  // A busca por código de barras via API (/api/produto-por-codigo) NÃO é testada aqui:
  // ela chama serviços externos (Kodebar e Open Beauty Facts) e gastaria a cota diária.
  // Assim, este teste roda sem rede externa (só o servidor local e o MySQL).

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

  // Gestão de produtos (Vendedor): ocultar da vitrine, editar, código único
  r = await vendedor('/vendedor/produtos?q=Marca');
  const achado = r.texto.match(/\/vendedor\/produtos\/(\d+)\/editar/);
  conferir('vendedor abre "Gerenciar produtos" e vê o produto criado', r.status === 200 && !!achado);
  const pid = achado && achado[1];
  r = await cliente('/vendedor/produtos');
  conferir('cliente NÃO gerencia produtos (403)', r.status === 403);
  r = await cliente('/vendedor/produtos/' + pid + '/editar', { metodo: 'POST', corpo: { nome: 'hack' } });
  conferir('cliente NÃO edita produto (403)', r.status === 403);
  r = await visitante('/vendedor/produtos');
  conferir('visitante vai para o login', r.status === 302 && r.local === '/login');
  r = await vendedor('/vendedor/produtos/' + pid + '/visibilidade', { metodo: 'POST', corpo: { visivel: '0' } });
  conferir('vendedor oculta produto (POST)', r.status === 302);
  r = await vendedor('/vendedor/produtos/' + pid + '/visibilidade');
  conferir('ocultar por GET não existe (404)', r.status === 404);
  r = await visitante('/');
  conferir('vitrine NÃO mostra produto oculto', !r.texto.includes('Perfume &lt;b&gt;Teste'));
  r = await vendedor('/itens');
  conferir('/itens do vendedor mostra o oculto com "Na vitrine"', r.texto.includes('Perfume &lt;b&gt;Teste') && r.texto.includes('Na vitrine'));
  r = await cliente('/carrinho/adicionar', { metodo: 'POST', corpo: { perfumeId: pid } });
  r = await cliente('/carrinho');
  conferir('cliente NÃO põe produto oculto no carrinho', !r.texto.includes('Perfume &lt;b&gt;Teste'));
  r = await vendedor('/vendedor/venda?q=Teste');
  conferir('"Abrir venda" ainda acha produto oculto (nome)', r.texto.includes('Perfume &lt;b&gt;Teste'));
  await vendedor('/vendedor/venda/codigo', { metodo: 'POST', corpo: { codigo: '789' + id } });
  r = await vendedor('/vendedor/venda');
  conferir('"Abrir venda" acha produto oculto (código de barras)', r.texto.includes('Perfume &lt;b&gt;Teste'));
  r = await vendedor('/vendedor/produtos/' + pid + '/editar');
  conferir('tela de edição abre preenchida', r.status === 200 && r.texto.includes('789' + id) && r.texto.includes('editar-produto.js'));
  r = await vendedor('/vendedor/produtos/' + pid + '/editar', { metodo: 'POST', corpo: { nome: 'Outro', marca: 'Marca', preco: '5', estoque: '1', codigo_barras: '7891033000011' } });
  conferir('editar com código de OUTRO produto -> 400', r.status === 400 && r.texto.includes('Já existe um produto'));
  r = await vendedor('/vendedor/produtos/' + pid + '/editar', { metodo: 'POST', corpo: { nome: 'x', marca: 'Marca', preco: '-5', estoque: '1' } });
  conferir('editar com dado inválido -> 400', r.status === 400);
  r = await vendedor('/vendedor/produtos/' + pid + '/editar', { metodo: 'POST', corpo: { nome: 'Perfume Editado', marca: 'Marca', preco: '55,5', estoque: '7', descricao: 'nova', codigo_barras: '789' + id, foto_url: '', visivel: 'on' } });
  conferir('editar salva e redireciona', r.status === 302 && r.local === '/vendedor/produtos');
  r = await visitante('/');
  conferir('produto editado e marcado visível volta à vitrine', r.texto.includes('Perfume Editado'));
  r = await vendedor('/vendedor/produtos/99999999/editar');
  conferir('produto inexistente -> 404', r.status === 404);

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
  process.exit(falhas ? 1 : 0);
})();
