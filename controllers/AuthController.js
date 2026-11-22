/**
 * controllers/AuthController.js
 * Telas e ações de login, cadastro de cliente e logout.
 */
const { ErroDeValidacao } = require('../utils/erros');
const { NOME_COOKIE } = require('../config/sessao');
const { CARRINHOS } = require('../services/CarrinhoService');
const { caminhoInterno } = require('../utils/caminho');

class AuthController {
  /** @param {AuthService} authService */
  constructor(authService) {
    this.auth = authService;
  }

  /** GET /login */
  formLogin(req, res) {
    res.render('login', { erro: null, form: {} });
  }

  /** POST /login: confere a senha e abre a sessão. */
  async login(req, res) {
    try {
      const usuario = await this.auth.entrar(req.body.usuario, req.body.senha);
      const voltar = await this._abrirSessao(req, usuario);
      res.redirect(voltar); // volta para a página que pediu login (ou a vitrine)
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro;
      res.status(401).render('login', { erro: erro.message, form: { usuario: req.body.usuario } });
    }
  }

  /** GET /cadastro */
  formCadastro(req, res) {
    res.render('cadastro', { erro: null, form: {} });
  }

  /** POST /cadastro: o cliente se cadastra sozinho e já entra. */
  async cadastrar(req, res) {
    try {
      const id = await this.auth.cadastrarCliente(req.body);
      const voltar = await this._abrirSessao(req, await this.auth.buscarPorId(id));
      res.redirect(voltar);
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro;
      res.status(400).render('cadastro', { erro: erro.message, form: { usuario: req.body.usuario, nome: req.body.nome } });
    }
  }

  /** POST /logout */
  logout(req, res) {
    // Apaga a sessão no servidor E o cookie no navegador (senão ele guardaria um id morto).
    req.session.destroy(() => {
      res.clearCookie(NOME_COOKIE);
      res.redirect('/');
    });
  }

  /**
   * Troca o id da sessão (evita fixação de sessão) e guarda o usuário. Mantém o carrinho.
   * @returns {Promise<string>} para onde ir agora: o caminho guardado quando o login foi pedido
   *   (já conferido por caminhoInterno: nunca outro site) ou a vitrine.
   */
  _abrirSessao(req, usuario) {
    const carrinho = req.session[CARRINHOS.SITE];
    const voltar = caminhoInterno(req.session.voltarPara); // lido ANTES: regenerate apaga a sessão antiga
    return new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        req.session.usuario = usuario.paraSessao();
        if (carrinho) req.session[CARRINHOS.SITE] = carrinho;
        // Quem entrou como Vendedor/Admin não usa o carrinho: voltar para lá daria 403, então vai para a vitrine.
        resolve(voltar.startsWith('/carrinho') && !usuario.podeUsarCarrinho() ? '/' : voltar);
      });
    });
  }
}

module.exports = AuthController;
