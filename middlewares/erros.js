/**
 * middlewares/erros.js
 * Tratador de erros do Express (o último middleware do app.js).
 */
const moeda = require('../utils/moeda');

/** Mensagens amigáveis por status. Qualquer outro status vira "Erro no servidor". */
const MENSAGENS = {
  400: { titulo: 'Pedido inválido', mensagem: 'Não foi possível entender o pedido. Confira os dados e tente de novo.' },
  403: { titulo: 'Acesso negado', mensagem: 'Você não tem permissão para ver esta página.' },
  404: { titulo: 'Página não encontrada', mensagem: 'Esse endereço não existe.' }
};
const PADRAO = { titulo: 'Erro no servidor', mensagem: 'Algo deu errado. Tente de novo.' };

/**
 * Loga o erro no servidor e mostra uma página amigável (sem detalhes internos).
 * Express reconhece o tratador de erros pelos 4 parâmetros.
 */
function tratarErro(err, req, res, next) {
  console.error(err);
  // Se a resposta já começou a ser enviada, não dá para desenhar a página: o Express encerra a conexão.
  if (res.headersSent) return next(err);

  // Erros de bibliotecas usam `status` ou `statusCode`; só aceita códigos de erro HTTP válidos.
  const codigo = Number(err && (err.status || err.statusCode));
  const status = codigo >= 400 && codigo < 600 ? codigo : 500;

  // A página de erro tem que funcionar mesmo se o erro veio ANTES do carregarUsuario (ex.: falha na sessão):
  // sem estes valores padrão ela quebrava com "usuario is not defined" e escondia o erro de verdade.
  res.locals.usuario = res.locals.usuario || null;
  res.locals.mostrarCarrinho = res.locals.mostrarCarrinho !== false;
  res.locals.moeda = res.locals.moeda || moeda;
  res.locals.aviso = res.locals.aviso || null;
  res.status(status).render('erro', MENSAGENS[status] || PADRAO);
}

module.exports = { tratarErro };
