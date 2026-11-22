/**
 * domain/Usuario.js
 * Classes de domínio dos usuários: Usuario (base), Cliente, Vendedor e Admin.
 * Cada papel responde "qual é o meu desconto?" por polimorfismo,
 * então o resto do sistema não precisa de "if (papel === ...)".
 */
const { SemDesconto, DescontoCliente } = require('./Desconto');

/** Usuário genérico. Sem desconto por padrão. */
class Usuario {
  /** @param {{id:number, usuario:string, nome:string}} dados */
  constructor({ id, usuario, nome }) {
    this.id = id;
    this.usuario = usuario;
    this.nome = nome;
  }

  /** Nome do papel (igual ao valor guardado no banco). */
  get papel() {
    throw new Error('Implemente papel na subclasse.');
  }

  /** Estratégia de desconto deste usuário. */
  estrategiaDesconto() {
    return new SemDesconto();
  }

  /** Pode finalizar compra pelo site? Só o Cliente (as subclasses mudam isso). */
  podeComprar() {
    return false;
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

/** Cliente: compra com 5% de desconto. */
class Cliente extends Usuario {
  get papel() { return 'cliente'; }
  estrategiaDesconto() { return new DescontoCliente(); }
  podeComprar() { return true; }
  podeUsarCarrinho() { return true; }
}

/** Vendedor: cria anúncios e abre vendas. */
class Vendedor extends Usuario {
  get papel() { return 'vendedor'; }
  podeGerenciar() { return true; } // qualquer Vendedor gerencia todos os produtos (ver Usuario.podeGerenciar)
}

/** Administrador: cria vendedores. */
class Admin extends Usuario {
  get papel() { return 'admin'; }
  podeGerenciar() { return true; } // o Admin também gerencia os produtos
}

/** Papel (texto do banco) -> classe. Novo papel = nova linha aqui. */
const CLASSES_POR_PAPEL = { cliente: Cliente, vendedor: Vendedor, admin: Admin };

/** Fábrica: cria o objeto certo a partir de uma linha do banco ou da sessão. */
function criarUsuario(dados) {
  const Classe = CLASSES_POR_PAPEL[dados.papel];
  if (!Classe) throw new Error(`Papel desconhecido: ${dados.papel}`);
  return new Classe(dados);
}

module.exports = { Usuario, Cliente, Vendedor, Admin, criarUsuario };
