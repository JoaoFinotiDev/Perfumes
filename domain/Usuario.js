/**
 * domain/Usuario.js
 * Classes de domínio dos usuários: Usuario (base), Cliente, Vendedor e Admin.
 * Cada papel responde por si mesmo (polimorfismo): "qual é o meu desconto?", "posso usar o carrinho?",
 * "sou vendedor?". Assim o resto do sistema PERGUNTA ao objeto e não compara texto (papel === '...').
 */
const { SemDesconto, DescontoCliente } = require('./Desconto');

/**
 * Nomes dos papéis, iguais aos valores da coluna usuarios.papel no banco.
 * É o ÚNICO lugar com esses textos: rotas, serviços e repositórios usam PAPEIS.CLIENTE etc.
 */
const PAPEIS = Object.freeze({ CLIENTE: 'cliente', VENDEDOR: 'vendedor', ADMIN: 'admin' });

/** Usuário genérico. Sem desconto e sem nenhuma permissão especial por padrão. */
class Usuario {
  /** @param {{id:number, usuario:string, nome:string}} dados */
  constructor({ id, usuario, nome }) {
    this.id = id;
    this.usuario = usuario;
    this.nome = nome;
  }

  /** Nome do papel (igual ao valor guardado no banco). Cada subclasse devolve o seu. */
  get papel() {
    throw new Error('Implemente "papel" na subclasse.');
  }

  /** Este usuário tem um dos papéis da lista? Usado pelo middleware exigirPapel. */
  temPapel(...papeis) {
    return papeis.includes(this.papel);
  }

  /** É Cliente? (as subclasses que são trocam para true) */
  ehCliente() { return false; }

  /** É Vendedor? */
  ehVendedor() { return false; }

  /** É Admin? */
  ehAdmin() { return false; }

  /** Estratégia de desconto deste usuário (padrão Strategy, veja domain/Desconto.js). */
  estrategiaDesconto() {
    return new SemDesconto();
  }

  /**
   * Pode usar o carrinho do site (ver, adicionar, remover, finalizar)? Só o Cliente.
   * Vendedor e Admin vendem pela tela "Abrir venda" e nem veem o carrinho no menu.
   */
  podeUsarCarrinho() {
    return false;
  }

  /**
   * Pode editar e ocultar/mostrar este produto? É o ÚNICO lugar com essa regra.
   * Hoje: Vendedor e Admin gerenciam TODOS os produtos (a loja é uma só e os produtos
   * importados não têm dono). Sem argumento, responde "pode gerenciar produtos em geral?"
   * (usado para decidir o que listar). Para limitar ao dono, troque a regra do Vendedor
   * por: return !produto || produto.vendedorId === this.id;
   * @param {Perfume} [produto]
   */
  podeGerenciar(produto) { // eslint-disable-line no-unused-vars
    return false;
  }

  /** Dados mínimos guardados na sessão (nunca a senha). */
  paraSessao() {
    return { id: this.id, usuario: this.usuario, nome: this.nome, papel: this.papel };
  }
}

/** Cliente: compra pelo site com 5% de desconto. */
class Cliente extends Usuario {
  get papel() { return PAPEIS.CLIENTE; }
  ehCliente() { return true; }
  estrategiaDesconto() { return new DescontoCliente(); }
  podeUsarCarrinho() { return true; }
}

/** Vendedor: cria anúncios, gerencia produtos e abre vendas no balcão. */
class Vendedor extends Usuario {
  get papel() { return PAPEIS.VENDEDOR; }
  ehVendedor() { return true; }
  podeGerenciar() { return true; } // qualquer Vendedor gerencia todos os produtos (veja Usuario.podeGerenciar)
}

/** Administrador: cria vendedores e também gerencia os produtos. */
class Admin extends Usuario {
  get papel() { return PAPEIS.ADMIN; }
  ehAdmin() { return true; }
  podeGerenciar() { return true; }
}

/** Papel (texto do banco) -> classe. Papel novo = uma linha nova aqui. */
const CLASSES_POR_PAPEL = { [PAPEIS.CLIENTE]: Cliente, [PAPEIS.VENDEDOR]: Vendedor, [PAPEIS.ADMIN]: Admin };

/** Fábrica: cria o objeto certo (Cliente, Vendedor ou Admin) a partir de uma linha do banco ou da sessão. */
function criarUsuario(dados) {
  const Classe = CLASSES_POR_PAPEL[dados.papel];
  if (!Classe) throw new Error(`Papel desconhecido: ${dados.papel}`);
  return new Classe(dados);
}

module.exports = { Usuario, Cliente, Vendedor, Admin, criarUsuario, PAPEIS };
