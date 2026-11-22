/**
 * public/javascripts/enviar-uma-vez.js
 * Formulário com o atributo data-enviar-uma-vez (ex.: "Finalizar compra"): depois do primeiro envio,
 * o botão trava e mostra "Enviando...". Assim um duplo clique não grava a compra duas vezes.
 * Sem JavaScript o formulário funciona igual (só não trava o botão).
 */
(function () {
  document.querySelectorAll('form[data-enviar-uma-vez]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (form.dataset.enviando) { e.preventDefault(); return; } // segundo envio: ignora
      form.dataset.enviando = '1';
      var botao = form.querySelector('button[type="submit"]');
      if (botao) {
        // Trava DEPOIS deste envio sair (um botão desativado no mesmo instante cancelaria o envio em alguns navegadores).
        setTimeout(function () { botao.disabled = true; botao.textContent = 'Enviando...'; }, 0);
      }
    });
  });
})();
