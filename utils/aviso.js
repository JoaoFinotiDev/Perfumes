/**
 * utils/aviso.js
 * Aviso de uma exibição ("flash") que aparece no topo da PRÓXIMA página.
 * Sucesso usa `req.session.aviso = 'texto'` (caixa verde, role="status": o leitor de tela lê sem interromper).
 * ERRO usa avisarErro (caixa vermelha, role="alert": o leitor de tela avisa na hora).
 * Quem lê e apaga os dois campos é o middleware carregarUsuario (middlewares/auth.js); quem desenha é o topo.ejs.
 */

/**
 * Guarda um aviso de ERRO para a próxima página.
 * @param {object} sessao req.session
 * @param {string} texto mensagem amigável (ex.: "Estoque insuficiente...")
 */
function avisarErro(sessao, texto) {
  sessao.aviso = texto;
  sessao.avisoErro = true;
}

module.exports = { avisarErro };
