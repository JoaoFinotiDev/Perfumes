/**
 * public/javascripts/mostrar-senha.js
 * "Olhinho" da senha: ao lado de cada campo com data-mostrar-senha aparece um botão que mostra/esconde
 * o que foi digitado (troca o type entre "password" e "text").
 * Acessível: é um <button> de verdade (Tab + Enter/Espaço), com aria-pressed (ligado/desligado),
 * aria-controls (qual campo ele controla) e texto lido pelo leitor de tela.
 * Sem JavaScript o botão não existe e o campo continua sendo uma senha normal.
 */
(function () {
  document.querySelectorAll('input[type="password"][data-mostrar-senha]').forEach(function (campo, i) {
    if (!campo.id) campo.id = 'senha-' + i; // aria-controls precisa de um id
    var botao = document.createElement('button');
    botao.type = 'button'; // não envia o formulário
    botao.className = 'mostrar-senha';
    botao.setAttribute('aria-controls', campo.id);

    /** Atualiza o botão para o estado atual (senha visível ou escondida). */
    function atualizar(visivel) {
      campo.type = visivel ? 'text' : 'password';
      botao.setAttribute('aria-pressed', visivel ? 'true' : 'false');
      botao.textContent = visivel ? 'Esconder' : 'Mostrar';
      botao.setAttribute('aria-label', visivel ? 'Esconder a senha' : 'Mostrar a senha');
    }

    botao.addEventListener('click', function () {
      atualizar(campo.type === 'password');
      campo.focus(); // volta o cursor para o campo
    });
    // Antes de enviar, esconde de novo (o navegador não guarda a senha como texto comum).
    if (campo.form) campo.form.addEventListener('submit', function () { atualizar(false); });

    atualizar(false);
    campo.insertAdjacentElement('afterend', botao);
  });
})();
