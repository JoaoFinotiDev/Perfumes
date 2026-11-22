/**
 * middlewares/auth.js
 * Middlewares de sessão e de permissão. O papel é checado AQUI, no servidor,
 * e não apenas escondendo botões na tela.
 */
const { criarUsuario } = require('../domain/Usuario');

/** Formata número como moeda brasileira (usado nas views). */
const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Roda em toda requisição: recria o usuário de domínio a partir da sessão
 * e deixa dados úteis disponíveis para as views (res.locals).
 */
function carregarUsuario(req, res, next) {
  req.usuario = req.session.usuario ? criarUsuario(req.session.usuario) : null;
  res.locals.usuario = req.usuario;
  res.locals.moeda = moeda;
  // Aviso de uma única exibição (flash): mostra e apaga.
  res.locals.aviso = req.session.aviso || null;
  delete req.session.aviso;
  next();
}

/** Exige que alguém esteja logado. */
function exigirLogin(req, res, next) {
  if (!req.usuario) {
    req.session.aviso = 'Entre para continuar.';
    return res.redirect('/login');
  }
  next();
}

/** Exige login E um dos papéis informados. Ex.: exigirPapel('vendedor'). */
function exigirPapel(...papeis) {
  return (req, res, next) => {
    if (!req.usuario) {
      req.session.aviso = 'Entre para continuar.';
      return res.redirect('/login');
    }
    if (!papeis.includes(req.usuario.papel)) {
      return res.status(403).render('erro', { titulo: 'Acesso negado', mensagem: 'Você não tem permissão para isso.' });
    }
    next();
  };
}

module.exports = { carregarUsuario, exigirLogin, exigirPapel };
