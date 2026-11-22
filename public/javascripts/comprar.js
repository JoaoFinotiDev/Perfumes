/**
 * public/javascripts/comprar.js
 * Bloco "preço + estoque + comprar" do card da vitrine e da página do produto.
 * Melhora o formulário (sem JS ele continua funcionando: o chip marcado e o campo de quantidade vão no POST):
 *  - ao escolher outro CHIP de variação, troca o preço, o selo de estoque ("Últimas N" / "Esgotado") e o "max" da quantidade;
 *  - mostra os botões - e + ao lado da quantidade;
 *  - desativa o botão "Adicionar" quando não há estoque.
 * Os textos (preço formatado e selo de estoque) já chegam prontos do servidor em atributos data-*:
 * o JS só os copia para a tela. A regra "Últimas N" mora em domain/Perfume.js (avisoDeEstoque), não aqui.
 * IMPORTANTE: o "max" do navegador é só um conforto. O servidor valida tudo de novo.
 */
document.querySelectorAll('[data-produto]').forEach(function (bloco) {
  var form = bloco.querySelector('[data-comprar]');
  if (!form) return; // Vendedor e Admin não têm formulário de compra

  var chips = form.querySelectorAll('[data-variacao]'); // radios dos chips (vazio se o produto não tem variações)
  var quantidade = form.querySelector('input[name="quantidade"]');
  var menos = form.querySelector('[data-menos]');
  var mais = form.querySelector('[data-mais]');
  var enviar = form.querySelector('[data-enviar]');
  var precoAntigo = bloco.querySelector('[data-preco-antigo]');
  var precoFinal = bloco.querySelector('[data-preco-final]');
  var aviso = bloco.querySelector('[data-estoque-texto]');

  // Os botões - e + só fazem sentido com JS: nascem escondidos no HTML e aparecem aqui.
  menos.hidden = false;
  mais.hidden = false;

  /** O chip (radio) marcado agora, ou null. */
  function escolhido() {
    return form.querySelector('[data-variacao]:checked');
  }

  /** Estoque da opção escolhida (ou do produto, quando não há variações). */
  function estoqueAtual() {
    if (!chips.length) return Number(quantidade.max) || 0;
    var chip = escolhido();
    return chip ? Number(chip.getAttribute('data-estoque')) : 0;
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

  /** Mostra preço e selo de estoque da opção escolhida. */
  function atualizarTextos() {
    var chip = escolhido();
    if (!chip) return;
    var cheio = chip.getAttribute('data-preco');
    var final = chip.getAttribute('data-final');
    precoFinal.textContent = final;
    precoAntigo.textContent = cheio;
    precoAntigo.hidden = cheio === final; // só mostra o preço riscado quando há desconto
    // Selo: o tipo ("ultimas", "esgotado" ou vazio) e o texto vêm do servidor.
    var tipo = chip.getAttribute('data-aviso-tipo');
    aviso.textContent = chip.getAttribute('data-aviso-texto');
    aviso.className = 'aviso-estoque aviso-' + tipo;
    aviso.hidden = !tipo;
    enviar.disabled = estoqueAtual() <= 0;
  }

  chips.forEach(function (chip) {
    chip.addEventListener('change', function () {
      atualizarTextos();
      ajustarQuantidade();
    });
  });
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
