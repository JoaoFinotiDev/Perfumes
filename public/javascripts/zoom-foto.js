/**
 * public/javascripts/zoom-foto.js
 * Página do produto: clicar na foto abre uma janela (<dialog>) com a foto grande.
 * Na janela, clicar na foto alterna o zoom (o dobro do tamanho, com rolagem para ver os detalhes).
 * Acessível: o <dialog> modal prende o foco dentro dele, Esc fecha, e o botão "Fechar" é o primeiro foco.
 * Sem JavaScript (ou navegador sem <dialog>) o link continua abrindo a foto inteira.
 */
(function () {
  var link = document.querySelector('a[data-zoom]');
  if (!link || typeof HTMLDialogElement === 'undefined') return;
  var miniatura = link.querySelector('img');

  // Monta a janela uma vez só.
  var janela = document.createElement('dialog');
  janela.className = 'janela-foto';
  janela.setAttribute('aria-label', miniatura.alt);
  var fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'janela-fechar';
  fechar.textContent = 'Fechar';
  var area = document.createElement('div');
  area.className = 'janela-area';
  var foto = document.createElement('img');
  foto.alt = miniatura.alt;
  foto.decoding = 'async';
  area.appendChild(foto);
  janela.appendChild(fechar);
  janela.appendChild(area);
  document.body.appendChild(janela);

  link.addEventListener('click', function (e) {
    e.preventDefault(); // abre a janela em vez de sair da página
    foto.src = miniatura.currentSrc || miniatura.src;
    foto.classList.remove('com-zoom');
    janela.showModal();
    fechar.focus();
  });
  // Clicar na foto aproxima / afasta.
  foto.addEventListener('click', function () { foto.classList.toggle('com-zoom'); });
  fechar.addEventListener('click', function () { janela.close(); });
  // Clicar fora da foto (no fundo escuro) também fecha.
  janela.addEventListener('click', function (e) { if (e.target === janela) janela.close(); });
  // Ao fechar, o foco volta para a foto da página (quem usa teclado não se perde).
  janela.addEventListener('close', function () { link.focus(); });
})();
