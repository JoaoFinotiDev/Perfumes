/**
 * controllers/CatalogoController.js
 * Catálogo de perfumes (GET /itens) e criação de anúncio (POST /itens).
 * Também a vitrine (GET /), a página do produto e as listas em JSON da busca.
 * O controller só lida com HTTP; as regras ficam nos services (VitrineService e GestaoProdutosService).
 */
const { ErroDeValidacao } = require('../utils/erros');
const { limparBusca } = require('../services/PerfumeService');

class CatalogoController {
  /**
   * Os dois services chegam prontos pelo construtor (container.js).
   * @param {VitrineService} vitrineService o que o comprador vê (cards, página do produto, JSON da busca)
   * @param {GestaoProdutosService} gestaoService criar anúncio e listar todos (inclusive ocultos)
   */
  constructor(vitrineService, gestaoService) {
    this.servicoVitrine = vitrineService;
    this.servicoGestao = gestaoService;
  }

  /**
   * GET /: vitrine em cards. Lê busca (q), marca, ordem, pagina e porPagina da URL
   * (o service valida tudo) e entrega tudo pronto para a view.
   */
  async vitrine(req, res) {
    const dados = await this.servicoVitrine.vitrine(
      {
        busca: req.query.q, marca: req.query.marca, ordem: req.query.ordem,
        pagina: req.query.pagina, porPagina: req.query.porPagina
      },
      req.usuario
    );
    res.render('vitrine', dados);
  }

  /**
   * GET /produto/:id: página do produto (foto grande, descrição, SKU, pontos, seletor de variação, adicionar).
   * Visitante e Cliente só abrem produtos visíveis; quem gerencia produtos abre todos. Senão: 404.
   */
  async produto(req, res) {
    const p = await this.servicoVitrine.paginaDoProduto(req.params.id, req.usuario);
    if (!p) {
      return res.status(404).render('erro', { titulo: 'Produto não encontrado', mensagem: 'Esse produto não existe.' });
    }
    res.render('produto', { p });
  }

  /**
   * GET /itens: tabela do catálogo com TODOS os produtos (inclusive ocultos da vitrine).
   * A rota só deixa entrar Vendedor e Admin (exigirPapel); Cliente e visitante usam a vitrine (/).
   */
  async listar(req, res) {
    const busca = limparBusca(req.query.q);
    const perfumes = await this.servicoGestao.listar(busca, { incluirOcultos: true });
    res.render('itens', { perfumes, busca, erro: null, form: {} });
  }

  /** POST /itens: grava um anúncio novo e volta para a lista. Só vendedor (a rota já barra os outros). */
  async criar(req, res) {
    try {
      await this.servicoGestao.criar(req.body, req.usuario.id);
      req.session.aviso = 'Anúncio criado com sucesso.';
      res.redirect('/itens');
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro;
      // Dado inválido: mostra a lista de novo, com o erro e o que foi digitado.
      const perfumes = await this.servicoGestao.listar('', { incluirOcultos: true });
      res.status(400).render('itens', {
        perfumes, busca: '', erro: erro.message, form: req.body
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
    res.json(await this.servicoVitrine.buscarParaLista(q, { incluirOcultos }, req.usuario));
  }

  /**
   * GET /api/produtos/:id/variacoes: variações do produto para a segunda busca de "Abrir venda".
   * Rota LOCAL (só o nosso banco). Só quem gerencia produtos (Vendedor/Admin) usa; visitante e Cliente
   * recebem 403 em JSON. Produto que não existe: 404 em JSON.
   */
  async variacoesJson(req, res) {
    if (!(req.usuario && req.usuario.podeGerenciar())) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }
    const variacoes = await this.servicoVitrine.variacoesParaLista(req.params.id);
    if (!variacoes) return res.status(404).json({ erro: 'Produto não encontrado.' });
    res.json(variacoes);
  }
}

module.exports = CatalogoController;
