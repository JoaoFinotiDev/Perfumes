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
   * GET /produto/:id: página do produto (foto grande, descrição, SKU, pontos, seletor de variação, adicionar).
   * Visitante e Cliente só abrem produtos visíveis; quem gerencia produtos abre todos. Senão: 404.
   */
  async produto(req, res) {
    const p = await this.perfumes.paginaDoProduto(req.params.id, req.usuario);
    if (!p) {
      return res.status(404).render('erro', { titulo: 'Produto não encontrado', mensagem: 'Esse produto não existe.' });
    }
    res.render('produto', { p, temDesconto: this._temDesconto(req) });
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

  /**
   * GET /api/produtos?q=...: JSON para a lista suspensa de busca (rota LOCAL, lê só o nosso banco).
   * Sem `todos`: só produtos visíveis, para qualquer um (é o que a vitrine já mostra).
   * Com `todos=1` (tela "Abrir venda"): inclui os ocultos, então exige quem gerencia produtos
   * (Vendedor/Admin); os outros recebem 403 em JSON. O limite de resultados fica no service.
   */
  async buscarJson(req, res) {
    const incluirOcultos = req.query.todos === '1';
    if (incluirOcultos && !(req.usuario && req.usuario.podeGerenciar())) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }
    const q = String(req.query.q || ''); // o service apara e limita o tamanho
    res.json(await this.perfumes.buscarParaLista(q, { incluirOcultos }, req.usuario));
  }

  /** Quem está logado tem desconto? Pergunta à estratégia dele (percentual maior que 0), sem olhar o papel. */
  _temDesconto(req) {
    return Boolean(req.usuario) && req.usuario.estrategiaDesconto().percentual() > 0;
  }
}

module.exports = CatalogoController;
