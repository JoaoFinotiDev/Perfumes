/**
 * public/javascripts/editar-produto.js
 * Tela de edição de produto: o leitor de código de barras digita o número e "aperta" Enter.
 * Sem este script, o Enter enviaria o formulário sem querer. Aqui o Enter no campo só é ignorado.
 * Não chama nenhuma API: a edição usa apenas o banco local.
 */
document.getElementById('codigo_barras').addEventListener('keydown', function (evento) {
  if (evento.key === 'Enter') evento.preventDefault();
});
