/**
 * services/AuthService.js
 * Regras de login e cadastro de usuários (cliente e vendedor).
 * Senhas sempre com hash bcrypt.
 */
const bcrypt = require('bcryptjs');
const { criarUsuario, PAPEIS } = require('../domain/Usuario');
const { ErroDeValidacao } = require('../utils/erros');
const v = require('../utils/validacao');

// Hash de mentira, usado para o tempo de resposta ser parecido quando o usuário não existe.
const HASH_FALSO = '$2b$10$mWW3Q5fUBmThjPQyw/lClu9OCvJtY1tRSLKckf33JaWGXXoUmplIa';

class AuthService {
  /** @param {UsuarioRepository} usuarios */
  constructor(usuarios) {
    this.usuarios = usuarios;
  }

  /**
   * Confere usuário e senha. Devolve o Usuario de domínio ou lança erro.
   * A senha nunca é guardada pura: o banco tem só o "hash" (um embaralhado sem volta),
   * e o bcrypt compara a senha digitada com ele.
   * A mensagem de erro é igual para usuário errado e senha errada (não revela qual foi).
   */
  async entrar(usuario, senha) {
    const linha = await this.usuarios.buscarLinhaPorUsuario(String(usuario || '').trim().toLowerCase());
    const confere = await bcrypt.compare(String(senha || ''), linha ? linha.senha_hash : HASH_FALSO);
    if (!linha || !confere) throw new ErroDeValidacao('Usuário ou senha inválidos.');
    return criarUsuario(linha);
  }

  /** Cadastro feito pelo próprio cliente. */
  cadastrarCliente(dados) {
    return this._criar(dados, PAPEIS.CLIENTE);
  }

  /** Cadastro de vendedor (a rota só deixa o admin chegar aqui). */
  cadastrarVendedor(dados) {
    return this._criar(dados, PAPEIS.VENDEDOR);
  }

  /** Valida os dados, gera o hash e grava. */
  async _criar(dados, papel) {
    const novo = {
      usuario: v.nomeDeUsuario(dados.usuario),
      nome: v.texto(dados.nome, 'Nome', { min: 2, max: 100 }),
      senhaHash: await bcrypt.hash(v.senhaNova(dados.senha), 10),
      papel
    };
    try {
      return await this.usuarios.criar(novo);
    } catch (erro) {
      if (erro.code === 'ER_DUP_ENTRY') throw new ErroDeValidacao('Esse usuário já existe.');
      throw erro;
    }
  }

  /** Lista de clientes (para a tela de venda). */
  listarClientes() { return this.usuarios.listarPorPapel(PAPEIS.CLIENTE); }

  /** Lista de vendedores (para a tela do admin). */
  listarVendedores() { return this.usuarios.listarPorPapel(PAPEIS.VENDEDOR); }

  /** Busca usuário por id. */
  buscarPorId(id) { return this.usuarios.buscarPorId(id); }
}

module.exports = AuthService;
