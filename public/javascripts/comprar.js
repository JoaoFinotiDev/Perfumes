/**
 * public/javascripts/comprar.js
 * Bloco "preço + estoque + comprar" do card da vitrine e da página do produto.
 * Melhora o formulário (sem JS ele continua funcionando, com o <select> e o campo de quantidade):
 *  - ao escolher outra variação, troca o preço, o estoque e o "max" da quantidade;
 *  - mostra os botões - e + ao lado da quantidade;
 *  - desativa o botão "Adicionar ao carrinho" quando não há estoque.
 * Os textos de preço já chegam formatados do servidor (atributos data-*): o JS só os copia para a tela.
 * IMPORTANTE: o "max" do navegador é só um conforto. O servidor valida tudo de novo.
 */
document.querySelectorAll('[data-produto]').forEach(function (bloco) {
  var form = bloco.querySelector('[data-comprar]');
  if (!form) return; // Vendedor e Admin não têm formulário de compra

  var select = form.querySelector('[data-variacao]');
  var quantidade = form.querySelector('input[name="quantidade"]');
  var menos = form.querySelector('[data-menos]');
  var mais = form.querySelector('[data-mais]');
  var enviar = form.querySelector('[data-enviar]');
  var precoAntigo = bloco.querySelector('[data-preco-antigo]');
  var precoFinal = bloco.querySelector('[data-preco-final]');
  var estoqueTexto = bloco.querySelector('[data-estoque-texto]');

  // Os botões - e + só fazem sentido com JS: nascem escondidos no HTML e aparecem aqui.
  menos.hidden = false;
  mais.hidden = false;

  /** Estoque da opção escolhida (ou do produto, quando não há variações). */
  function estoqueAtual() {
    if (!select) return Number(quantidade.max) || 0;
    var opcao = select.options[select.selectedIndex];
    return opcao ? Number(opcao.getAttribute('data-estoque')) : 0;
  }

  /** Mantém a quantidade entre 1 e o estoque. */
  function ajustarQuantidade() {
    var max = Math.max(1, estoqueAtual());
    quantidade.max = String(max);
    var n = parseInt(quantidade.value, 10);
    if (!(n >= 1)) n = 1;
    if (n > max) n = max;
    quantidade.value = String(n);
  }

  /** Mostra preço e estoque da variação escolhida. */
  function atualizarTextos() {
    if (!select) return;
    var opcao = select.options[select.selectedIndex];
    if (!opcao) return;
    var cheio = opcao.getAttribute('data-preco');
    var final = opcao.getAttribute('data-final');
    precoFinal.textContent = final;
    precoAntigo.textContent = cheio;
    precoAntigo.hidden = cheio === final; // só mostra o preço riscado quando há desconto
    var estoque = estoqueAtual();
    estoqueTexto.textContent = estoque > 0 ? estoque + ' em estoque' : 'Esgotado';
    estoqueTexto.className = estoque > 0 ? 'estoque' : 'esgotado';
    enviar.disabled = estoque <= 0;
  }

  if (select) {
    select.addEventListener('change', function () {
      atualizarTextos();
      ajustarQuantidade();
    });
  }
  menos.addEventListener('click', function () {
    quantidade.value = String((parseInt(quantidade.value, 10) || 1) - 1);
    ajustarQuantidade();
  });
  mais.addEventListener('click', function () {
    quantidade.value = String((parseInt(quantidade.value, 10) || 0) + 1);
    ajustarQuantidade();
  });
  quantidade.addEventListener('change', ajustarQuantidade);
  ajustarQuantidade();
});
