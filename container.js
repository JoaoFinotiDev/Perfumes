/**
 * container.js
 * "Raiz de composição": o único lugar que cria os objetos e os conecta
 * (injeção de dependências). Fluxo: db -> repositories -> services -> controllers.
 */
const db = require('./config/db');

const UsuarioRepository = require('./repositories/UsuarioRepository');
const PerfumeRepository = require('./repositories/PerfumeRepository');
const VendaRepository = require('./repositories/VendaRepository');

const AuthService = require('./services/AuthService');
const PerfumeService = require('./services/PerfumeService');
const CarrinhoService = require('./services/CarrinhoService');
const VendaService = require('./services/VendaService');

const KodebarBuscador = require('./buscadores/KodebarBuscador');
const OpenBeautyFactsBuscador = require('./buscadores/OpenBeautyFactsBuscador');
const BuscadorEmCadeia = require('./buscadores/BuscadorEmCadeia');

const CatalogoController = require('./controllers/CatalogoController');
const AuthController = require('./controllers/AuthController');
const CarrinhoController = require('./controllers/CarrinhoController');
const VendaController = require('./controllers/VendaController');
const AdminController = require('./controllers/AdminController');
const ProdutoApiController = require('./controllers/ProdutoApiController');

// Repositórios recebem a conexão com o banco.
const usuarios = new UsuarioRepository(db);
const perfumes = new PerfumeRepository(db);
const vendas = new VendaRepository(db);

// Serviços recebem repositórios.
const authService = new AuthService(usuarios);
const perfumeService = new PerfumeService(perfumes);
const carrinhoService = new CarrinhoService(perfumeService);
const vendaService = new VendaService(vendas);

// Busca por código de barras: tenta Kodebar primeiro e, se não achar, Open Beauty Facts.
const buscador = new BuscadorEmCadeia([new KodebarBuscador(), new OpenBeautyFactsBuscador()]);

// Controllers recebem serviços.
module.exports = {
  catalogo: new CatalogoController(perfumeService),
  auth: new AuthController(authService),
  carrinho: new CarrinhoController(carrinhoService, vendaService),
  venda: new VendaController(carrinhoService, perfumeService, authService, vendaService),
  admin: new AdminController(authService),
  produtoApi: new ProdutoApiController(buscador)
};
