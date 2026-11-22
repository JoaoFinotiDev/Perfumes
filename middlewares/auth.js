/**
 * middlewares/auth.js
 * Middlewares de sessão e de permissão.
 * Middleware é uma função que roda ANTES do controller, a cada requisição.
 * Ela pode deixar a requisição seguir (next) ou barrá-la.
 * O papel é checado AQUI, no servidor, e não apenas escondendo botões na tela
 * (quem esconde só o botão ainda deixa a pessoa digitar o endereço na mão).
 */
const { criarUsuario, PAPEIS } = require('../domain/Usuario');
const { DescontoCliente } = require('../domain/Desconto');
const moeda = require('../utils/moeda'); // formata dinheiro (R$ 12,50) para as views
const { avisarErro } = require('../utils/aviso');

/**
 * Roda em toda requisição: recria o usuário de domínio a partir da sessão
 * e deixa dados úteis disponíveis para as views (res.locals).
 * Por que recriar? A sessão guarda só dados simples; o objeto (Cliente, Vendedor...)
 * é quem sabe responder "qual é o meu desconto?" ou "posso usar o carrinho?".
 */
function carregarUsuario(req, res, next) {
  req.usuario = req.session.usuario ? criarUsuario(req.session.usuario) : null;
  res.locals.usuario = req.usuario;
  res.locals.moeda = moeda;
  // Mostrar o link "Carrinho" e o botão "Adicionar ao carrinho"? Visitante vê (ao clicar vai para o login);
  // logado só vê se o papel pode usar o carrinho (Cliente). Vendedor e Admin vendem por "Abrir venda".
  res.locals.mostrarCarrinho = !req.usuario || req.usuario.podeUsarCarrinho();
  // Desconto de quem está logado, em número inteiro (5 = 5%; 0 = sem desconto). As views só mostram.
  res.locals.percentualDesconto = req.usuario ? req.usuario.estrategiaDesconto().emPorcento() : 0;
  // Desconto que um Cliente ganha (para o convite "cadastre-se e ganhe 5%"). Vem da própria regra, não de um texto fixo.
  res.locals.percentualCliente = new DescontoCliente().emPorcento();
  // Aviso de uma única exibição ("flash"): mostra uma vez e apaga da sessão.
  // avisoErro diz se é erro (caixa vermelha) ou sucesso (verde); veja utils/aviso.js.
  res.locals.aviso = req.session.aviso || null;
  res.locals.avisoErro = Boolean(req.session.avisoErro);
  delete req.session.aviso;
  delete req.session.avisoErro;
  next();
}

/**
 * Monta um middleware que exige login E um dos papéis informados.
 * Sem login: guarda `avisoSemLogin` e manda para a tela de entrada.
 * Com papel errado: responde 403 (acesso negado). O papel é perguntado ao objeto (Usuario.temPapel).
 */
function criarBarreira(avisoSemLogin, papeis) {
  return (req, res, next) => {
    if (!req.usuario) {
      avisarErro(req.session, avisoSemLogin); // barrado: aviso em vermelho na tela de login
      return res.redirect('/login');
    }
    if (!req.usuario.temPapel(...papeis)) {
      return res.status(403).render('erro', { titulo: 'Acesso negado', mensagem: 'Você não tem permissão para isso.' });
    }
    next();
  };
}

/** Exige um dos papéis informados. Ex.: exigirPapel(PAPEIS.VENDEDOR, PAPEIS.ADMIN). */
function exigirPapel(...papeis) {
  return criarBarreira('Entre para continuar.', papeis);
}

/** Rotas do carrinho: só o Cliente. O visitante vai para o login com um aviso próprio. */
const exigirCliente = criarBarreira('Entre como cliente para comprar.', [PAPEIS.CLIENTE]);

module.exports = { carregarUsuario, exigirPapel, exigirCliente };
