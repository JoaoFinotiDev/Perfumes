/**
 * controllers/CatalogoController.js
 * Catálogo de perfumes (GET /itens) e criação de anúncio (POST /itens).
 * O controller só lida com HTTP; as regras ficam no PerfumeService.
 */
const { ErroDeValidacao } = require('../utils/erros');

class CatalogoController {
  /** @param {PerfumeService} perfumeService regras do catálogo (recebido pelo container.js) */
  constructor(perfumeService) {
    this.perfumes = perfumeService;
  }

  /** GET /: vitrine em cards. Lê busca (q), marca e ordem da URL e entrega tudo pronto para a view. */
  async vitrine(req, res) {
    const dados = await this.perfumes.vitrine(
      { busca: req.query.q, marca: req.query.marca, ordem: req.query.ordem },
      req.usuario
    );
    res.render('vitrine', { ...dados, temDesconto: this._temDesconto(req) });
  }

  /**
   * GET /itens: tabela do catálogo com TODOS os produtos (inclusive ocultos da vitrine).
   * A rota só deixa entrar Vendedor e Admin (exigirPapel); Cliente e visitante usam a vitrine (/).
   */
  async listar(req, res) {
    const busca = String(req.query.q || '').trim();
    const perfumes = await this.perfumes.listar(busca, { incluirOcultos: true });
    res.render('itens', { perfumes, busca, erro: null, form: {}, temDesconto: this._temDesconto(req) });
  }

  /** POST /itens: grava um anúncio novo e volta para a lista. Só vendedor (a rota já barra os outros). */
  async criar(req, res) {
    try {
      await this.perfumes.criar(req.body, req.usuario.id);
      req.session.aviso = 'Anúncio criado com sucesso.';
      res.redirect('/itens');
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro;
      // Dado inválido: mostra a lista de novo, com o erro e o que foi digitado.
      const perfumes = await this.perfumes.listar('', { incluirOcultos: true });
      res.status(400).render('itens', {
        perfumes, busca: '', erro: erro.message, form: req.body,
        temDesconto: this._temDesconto(req)
      });
    }
  }

  /** Quem está logado tem desconto? Pergunta à estratégia dele (percentual maior que 0), sem olhar o papel. */
  _temDesconto(req) {
    return Boolean(req.usuario) && req.usuario.estrategiaDesconto().percentual() > 0;
  }
}

module.exports = CatalogoController;
