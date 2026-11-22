/**
 * utils/ligar.js
 * Liga um método de um controller a uma rota do Express.
 * Se o método (async) falhar, o erro vai para o tratador de erros do app.
 * Por que isso existe? O Express 4 não captura sozinho o erro de função async;
 * o ".catch(next)" entrega o erro ao Express para ele mostrar a página de erro.
 * @param {object} controller objeto que tem o método
 * @param {string} metodo nome do método a chamar
 */
function ligar(controller, metodo) {
  return (req, res, next) => {
    Promise.resolve(controller[metodo](req, res, next)).catch(next);
  };
}

module.exports = ligar;
