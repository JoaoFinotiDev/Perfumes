/**
 * public/javascripts/pontos-por-marca.js
 * Nos formulários de produto, o campo "Pontos" só aparece quando a marca digitada é a que tem pontos
 * (o nome da marca vem do servidor, no atributo data-marca-pontos; a regra de verdade fica em
 * domain/Perfume.js e o servidor ignora os pontos das outras marcas de qualquer jeito).
 */
(function () {
  var campo = document.querySelector('[data-pontos]');
  var marca = document.querySelector('input[name="marca"]');
  if (!campo || !marca) return;
  var alvo = campo.getAttribute('data-marca-pontos').trim().toLowerCase();

  function atualizar() {
    campo.hidden = marca.value.trim().toLowerCase() !== alvo;
  }
  marca.addEventListener('input', atualizar);
  atualizar();
})();
