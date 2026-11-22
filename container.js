/**
 * container.js
 * "Raiz de composição": o único lugar que cria os objetos e os conecta
 * (injeção de dependências: cada classe recebe pronto o que precisa, em vez de
 * criar sozinha; assim fica fácil trocar uma peça ou testar sem banco).
 * Fluxo: db -> repositories -> services -> controllers.
 */
const db = require('./config/db');

const UsuarioRepository = require('./repositories/UsuarioRepository');
const PerfumeRepository = require('./repositories/PerfumeRepository');
const VendaRepository = require('./repositories/VendaRepository');

const AuthService = require('./services/AuthService');
const PerfumeService = require('./services/PerfumeService');
const VitrineService = require('./services/VitrineService');
const GestaoProdutosService = require('./services/GestaoProdutosService');
const CarrinhoService = require('./services/CarrinhoService');
const VendaService = require('./services/VendaService');

const KodebarBuscador = require('./buscadores/KodebarBuscador');
const OpenBeautyFactsBuscador = require('./buscadores/OpenBeautyFactsBuscador');
const BuscadorEmCadeia = require('./buscadores/BuscadorEmCadeia');
const BuscadorComCache = require('./buscadores/BuscadorComCache');

const CatalogoController = require('./controllers/CatalogoController');
const AuthController = require('./controllers/AuthController');
const CarrinhoController = require('./controllers/CarrinhoController');
const VendaController = require('./controllers/VendaController');
const AdminController = require('./controllers/AdminController');
const ProdutoApiController = require('./controllers/ProdutoApiController');
const GestaoProdutosController = require('./controllers/GestaoProdutosController');

// Repositórios recebem a conexão com o banco.
const usuarios = new UsuarioRepository(db);
const perfumes = new PerfumeRepository(db);
const vendas = new VendaRepository(db);

// Serviços recebem repositórios.
const authService = new AuthService(usuarios);
// Produtos: consultas comuns (carrinho e venda), vitrine (comprador) e gestão (Vendedor/Admin).
const perfumeService = new PerfumeService(perfumes);
const vitrineService = new VitrineService(perfumes);
const gestaoService = new GestaoProdutosService(perfumes);
const carrinhoService = new CarrinhoService(perfumeService);
const vendaService = new VendaService(vendas);

// Busca por código de barras: tenta Kodebar primeiro e completa com Open Beauty Facts.
// O cache por fora evita gastar a cota diária buscando o mesmo código de novo.
const buscador = new BuscadorComCache(
  new BuscadorEmCadeia([new KodebarBuscador(), new OpenBeautyFactsBuscador()])
);

// Controllers recebem serviços.
module.exports = {
  catalogo: new CatalogoController(vitrineService, gestaoService),
  auth: new AuthController(authService),
  carrinho: new CarrinhoController(carrinhoService, vendaService),
  venda: new VendaController(carrinhoService, perfumeService, authService, vendaService),
  admin: new AdminController(authService),
  produtoApi: new ProdutoApiController(buscador),
  gestaoProdutos: new GestaoProdutosController(gestaoService)
};
