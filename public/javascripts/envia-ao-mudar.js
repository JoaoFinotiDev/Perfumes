/**
 * public/javascripts/envia-ao-mudar.js
 * Melhoria opcional: ao mudar um campo marcado com `data-envia-ao-mudar` (na vitrine: marca, ordem e "Mostrar"),
 * envia o formulário dele sozinho. Sem JavaScript, o botão "Buscar" do mesmo formulário faz o mesmo.
 */
document.querySelectorAll('[data-envia-ao-mudar]').forEach(function (campo) {
  campo.addEventListener('change', function () {
    if (campo.form) campo.form.submit();
  });
});
