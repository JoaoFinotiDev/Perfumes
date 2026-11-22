/**
 * scripts/importador-de-catalogo.js
 * Importador COMUM a todas as lojas (Mawwal, Queen Semijoias...). Nao tem SQL: so grava pelo PerfumeRepository.
 *
 * Ideia (SOLID, aberto/fechado): esta classe NAO sabe de que loja vem o dado. Ela recebe um CONVERSOR
 * (que transforma um produto bruto da loja em Perfume) e orquestra: converte, confere se ja existe e grava.
 * Loja nova = conversor novo (e, se a chave de "ja existe" for outra, uma subclasse que troca `localizar`),
 * sem mexer nesta classe nem no importador das outras lojas.
 *
 * Contrato do conversor: `converter(bruto)` devolve um Perfume ou null (produto invalido).
 * Se o Perfume trouxer `variacoes`, elas sao gravadas junto e o produto fica sincronizado
 * (menor preco e soma dos estoques) pelo repositorio.
 */
class ImportadorDeCatalogo {
  /**
   * @param {PerfumeRepository} repositorio
   * @param {{converter: function(object): (Perfume|null)}} conversor
   */
  constructor(repositorio, conversor) {
    this.repositorio = repositorio;
    this.conversor = conversor;
  }

  /**
   * Procura no banco o produto que ja foi importado (ou null). Padrao: mesmo nome + marca
   * ou mesmo codigo de barras. Subclasses podem trocar a chave (a Queen usa o SKU).
   */
  async localizar(perfume) {
    return (await this.repositorio.buscarPorNomeEMarca(perfume.nome, perfume.marca))
      || (perfume.codigoBarras ? this.repositorio.buscarPorCodigo(perfume.codigoBarras) : null);
  }

  /** Converte cada produto e grava se ainda nao existir (rodar 2x da o mesmo resultado). */
  async importar(produtos) {
    const resumo = { importados: 0, pulados: 0, invalidos: 0 };
    for (const bruto of produtos) {
      const perfume = this.conversor.converter(bruto);
      if (!perfume) { resumo.invalidos++; continue; }
      if (await this.localizar(perfume)) { resumo.pulados++; continue; }
      const id = await this.repositorio.criar(perfume);
      // Variacoes (opcionais): grava cada uma na ordem e deixa o produto com o menor preco e a soma dos estoques.
      if (perfume.variacoes.length) {
        for (const [ordem, v] of perfume.variacoes.entries()) {
          await this.repositorio.criarVariacao(id, { descricao: v.descricao, preco: v.preco, estoque: v.estoque, ativo: true, ordem });
        }
        await this.repositorio.sincronizarComVariacoes(id);
      }
      resumo.importados++;
    }
    return resumo;
  }

  /**
   * Conserta SO a descricao de produtos ja importados que ficaram com entidades cruas ("&ccedil;").
   * Para cada produto da fonte, acha o do banco (nome + marca) e regrava a descricao ja decodificada,
   * mas apenas quando a do banco ainda tem "&...;". Nao mexe em mais nada e nao apaga nada.
   * Pode rodar varias vezes: depois de corrigida, a descricao nao tem mais "&...;" e e pulada.
   */
  async corrigirDescricoes(produtos) {
    let corrigidos = 0;
    for (const bruto of produtos) {
      const perfume = this.conversor.converter(bruto);
      if (!perfume) continue;
      const atual = await this.repositorio.buscarPorNomeEMarca(perfume.nome, perfume.marca);
      if (atual && /&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/i.test(atual.descricao || '') && atual.descricao !== perfume.descricao) {
        await this.repositorio.atualizarDescricao(atual.id, perfume.descricao);
        corrigidos++;
      }
    }
    return corrigidos;
  }
}

module.exports = ImportadorDeCatalogo;
