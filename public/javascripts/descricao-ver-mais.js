/**
 * public/javascripts/descricao-ver-mais.js
 * Tabela do catálogo (/itens): a descrição aparece em UMA linha (CSS). Este script mostra o botão
 * "Ver mais" só nas descrições que não cabem e alterna entre "Ver mais" e "Ver menos".
 * Sem biblioteca. O botão é um <button> de verdade, então funciona com Tab, Enter e Espaço;
 * aria-expanded avisa o leitor de tela se o texto está aberto.
 */
document.querySelectorAll('.desc-botao').forEach(function (botao) {
  var texto = document.getElementById(botao.getAttribute('aria-controls'));
  // scrollWidth maior que clientWidth = o texto é mais largo que a coluna (está cortado com "...").
  if (texto.scrollWidth > texto.clientWidth) botao.hidden = false;

  botao.addEventListener('click', function () {
    var aberto = texto.classList.toggle('aberta');
    botao.setAttribute('aria-expanded', String(aberto));
    botao.textContent = aberto ? 'Ver menos' : 'Ver mais';
  });
});
