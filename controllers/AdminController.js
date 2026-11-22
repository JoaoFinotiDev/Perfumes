/**
 * controllers/AdminController.js
 * Área do administrador: criar usuários Vendedor.
 */
const { ErroDeValidacao } = require('../utils/erros');

class AdminController {
  /** @param {AuthService} authService */
  constructor(authService) {
    this.auth = authService;
  }

  /** GET /admin: formulário e lista de vendedores. */
  async tela(req, res) {
    res.render('admin', { vendedores: await this.auth.listarVendedores(), erro: null, form: {} });
  }

  /** POST /admin/vendedores: cria um vendedor. */
  async criarVendedor(req, res) {
    try {
      await this.auth.cadastrarVendedor(req.body);
      req.session.aviso = 'Vendedor criado.';
      res.redirect('/admin');
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro;
      res.status(400).render('admin', {
        vendedores: await this.auth.listarVendedores(),
        erro: erro.message, form: { usuario: req.body.usuario, nome: req.body.nome }
      });
    }
  }
}

module.exports = AdminController;
