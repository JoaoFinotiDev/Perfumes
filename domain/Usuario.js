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

  /** Dados mínimos guardados na sessão (nunca a senha). */
  paraSessao() {
    return { id: this.id, usuario: this.usuario, nome: this.nome, papel: this.papel };
  }
}

/** Cliente: compra com 5% de desconto. */
class Cliente extends Usuario {
  get papel() { return 'cliente'; }
  estrategiaDesconto() { return new DescontoCliente(); }
}

/** Vendedor: cria anúncios e abre vendas. */
class Vendedor extends Usuario {
  get papel() { return 'vendedor'; }
}

/** Administrador: cria vendedores. */
class Admin extends Usuario {
  get papel() { return 'admin'; }
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
