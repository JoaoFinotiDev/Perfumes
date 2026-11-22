/**
 * utils/ligar.js
 * Liga um método de um controller a uma rota do Express.
 * Se o método (async) falhar, o erro vai para o tratador de erros do app.
 */
function ligar(controller, metodo) {
  return (req, res, next) => {
    Promise.resolve(controller[metodo](req, res, next)).catch(next);
  };
}

module.exports = ligar;
