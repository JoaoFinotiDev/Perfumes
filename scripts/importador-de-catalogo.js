/**
 * scripts/importador-de-catalogo.js
 * Importador COMUM a todas as lojas (Mawwal, Queen Semijoias...). Não tem SQL: só grava pelo PerfumeRepository.
 *
 * Ideia (SOLID, aberto/fechado): esta classe NÃO sabe de que loja vem o dado. Ela recebe um CONVERSOR
 * (que transforma um produto bruto da loja em Perfume) e orquestra: converte, confere se já existe e grava.
 * Loja nova = conversor novo (e, se a chave de "ja existe" for outra, uma subclasse que troca `localizar`),
 * sem mexer nesta classe nem no importador das outras lojas.
 *
 * Contrato do conversor: `converter(bruto)` devolve um Perfume ou null (produto inválido).
 * Se o Perfume trouxer `variacoes`, elas sao gravadas junto e o produto fica sincronizado
 * (menor preço e soma dos estoques) pelo repositório.
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
   * Procura no banco o produto que já foi importado (ou null). Padrão: mesmo nome + marca
   * ou mesmo código de barras. Subclasses podem trocar a chave (a Queen usa o SKU).
   */
  async localizar(perfume) {
    return (await this.repositorio.buscarPorNomeEMarca(perfume.nome, perfume.marca))
      || (perfume.codigoBarras ? this.repositorio.buscarPorCodigo(perfume.codigoBarras) : null);
  }

  /** Converte cada produto e grava se ainda não existir (rodar 2x dá o mesmo resultado). */
  async importar(produtos) {
    const resumo = { importados: 0, pulados: 0, invalidos: 0 };
    for (const bruto of produtos) {
      const perfume = this.conversor.converter(bruto);
      if (!perfume) { resumo.invalidos++; continue; }
      if (await this.localizar(perfume)) { resumo.pulados++; continue; }
      const id = await this.repositorio.criar(perfume);
      // Variações (opcionais): grava cada uma na ordem e deixa o produto com o menor preço e a soma dos estoques.
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
   * Conserta SÓ a descrição de produtos já importados que ficaram com entidades cruas ("&ccedil;").
   * Para cada produto da fonte, acha o do banco (nome + marca) e regrava a descrição já decodificada,
   * mas apenas quando a do banco ainda tem "&...;". Não mexe em mais nada e não apaga nada.
   * Pode rodar várias vezes: depois de corrigida, a descrição não tem mais "&...;" e é pulada.
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

/**
 * Lê uma opção --nome=valor da linha de comando (ex.: --arquivo=queen.json). Devolve o valor ou null.
 * Fica aqui porque todo importador usa (antes cada script tinha uma cópia igual).
 * @param {string} nome nome da opção, sem os dois traços
 * @param {string[]} argv argumentos (process.argv por padrão; os testes podem passar outros)
 */
ImportadorDeCatalogo.opcao = function opcao(nome, argv = process.argv) {
  const achado = argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : null;
};

module.exports = ImportadorDeCatalogo;
