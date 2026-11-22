/**
 * public/javascripts/gestao-variacoes.js
 * "Gerenciar produtos": a seta de um produto com variações mostra ou esconde as linhas das variações.
 *
 * Melhoria progressiva: sem JavaScript as linhas das variações aparecem sempre e a seta fica escondida.
 * Com JavaScript:
 *  1. a seta aparece e as variações começam recolhidas (menos as marcadas com data-aberta pelo servidor,
 *     que é o produto que acabou de mudar: ?aberto=<id>);
 *  2. clicar na seta OU em qualquer ponto da linha do produto (fora de botões, links e campos) abre/fecha;
 *  3. aria-expanded na seta conta ao leitor de tela se está aberta; o CSS gira a seta (> vira v).
 */
(function () {
  // Cliques nestes elementos são do próprio elemento (salvar, editar...), não abrem nem fecham a linha.
  var INTERATIVOS = 'a, button, input, select, textarea, label, form';

  document.querySelectorAll('[data-seta]').forEach(function (seta) {
    var linhas = seta.getAttribute('aria-controls').split(' ')
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    var linhaProduto = seta.closest('tr');

    /** Abre (true) ou fecha (false) as variações deste produto. */
    function mostrar(aberta) {
      seta.setAttribute('aria-expanded', aberta ? 'true' : 'false');
      linhas.forEach(function (tr) { tr.hidden = !aberta; });
    }

    function alternar() {
      mostrar(seta.getAttribute('aria-expanded') !== 'true');
    }

    seta.hidden = false;
    mostrar(linhas.some(function (tr) { return tr.hasAttribute('data-aberta'); }));
    seta.addEventListener('click', alternar);
    linhaProduto.addEventListener('click', function (e) {
      if (e.target.closest(INTERATIVOS)) return; // clique num botão/link/campo: deixa ele agir
      alternar();
    });
  });
})();
