/**
 * middlewares/auth.js
 * Middlewares de sessão e de permissão.
 * Middleware é uma função que roda ANTES do controller, a cada requisição.
 * Ela pode deixar a requisição seguir (next) ou barrá-la.
 * O papel é checado AQUI, no servidor, e não apenas escondendo botões na tela
 * (quem esconde só o botão ainda pode digitar o endereço na mão).
 */
const { criarUsuario } = require('../domain/Usuario');
const moeda = require('../utils/moeda'); // formata dinheiro (R$ 12,50) para as views

/**
 * Roda em toda requisição: recria o usuário de domínio a partir da sessão
 * e deixa dados úteis disponíveis para as views (res.locals).
 * Por que recriar? A sessão guarda só dados simples; o objeto (Cliente, Vendedor...)
 * é quem sabe responder "qual é o meu desconto?".
 */
function carregarUsuario(req, res, next) {
  req.usuario = req.session.usuario ? criarUsuario(req.session.usuario) : null;
  res.locals.usuario = req.usuario;
  res.locals.moeda = moeda;
  // Mostrar o link "Carrinho" e o botão "Adicionar ao carrinho"? Visitante vê (ao clicar vai para o login);
  // logado só vê se o papel pode usar o carrinho (Cliente). Vendedor e Admin vendem por "Abrir venda".
  res.locals.mostrarCarrinho = !req.usuario || req.usuario.podeUsarCarrinho();
  // Aviso de uma única exibição (flash): mostra uma vez e apaga da sessão.
  res.locals.aviso = req.session.aviso || null;
  delete req.session.aviso;
  next();
}

/**
 * Monta um middleware que exige login E um dos papéis informados.
 * Sem login, guarda `avisoSemLogin` e manda para a tela de entrada. Com papel errado, responde 403 (acesso negado).
 */
function criarBarreira(avisoSemLogin, papeis) {
  return (req, res, next) => {
    if (!req.usuario) {
      req.session.aviso = avisoSemLogin;
      return res.redirect('/login');
    }
    if (!papeis.includes(req.usuario.papel)) {
      return res.status(403).render('erro', { titulo: 'Acesso negado', mensagem: 'Você não tem permissão para isso.' });
    }
    next();
  };
}

/** Exige um dos papéis informados. Ex.: exigirPapel('vendedor'). */
function exigirPapel(...papeis) {
  return criarBarreira('Entre para continuar.', papeis);
}

/** Rotas do carrinho: só o Cliente. O visitante vai para o login com um aviso específico. */
const exigirCliente = criarBarreira('Entre como cliente para comprar.', ['cliente']);

module.exports = { carregarUsuario, exigirPapel, exigirCliente };
