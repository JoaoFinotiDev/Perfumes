/**
 * public/javascripts/cadastro-produto.js
 * No formulário de novo anúncio: ao digitar/bipar o código de barras e apertar
 * Enter (ou sair do campo), pergunta ao servidor os dados do produto e preenche
 * nome, marca, descrição e foto. Preço e estoque nunca são preenchidos aqui.
 * Se der qualquer erro, os campos ficam como estão, para digitar à mão.
 */
(function () {
  var campoCodigo = document.getElementById('codigo_barras');
  var status = document.getElementById('status-busca');
  if (!campoCodigo) return;

  // Preenche um campo só se veio valor.
  function preencher(id, valor) {
    if (valor) document.getElementById(id).value = valor;
  }

  // Último código buscado. Enter e "sair do campo" disparam juntos,
  // então sem isto o mesmo código seria buscado duas vezes e gastaria cota.
  var ultimoCodigo = '';

  function buscar() {
    var codigo = campoCodigo.value.trim();
    if (!/^\d{8,14}$/.test(codigo)) return;
    if (codigo === ultimoCodigo) return; // já buscado: não repete
    ultimoCodigo = codigo;
    status.textContent = 'Buscando dados do produto...';
    fetch('/api/produto-por-codigo/' + encodeURIComponent(codigo))
      .then(function (r) { return r.json(); })
      .then(function (dados) {
        if (dados.encontrado) {
          preencher('nome', dados.nome);
          preencher('marca', dados.marca);
          preencher('descricao', dados.descricao);
          preencher('foto_url', dados.foto);
          status.textContent = 'Dados preenchidos. Confira e informe preço e estoque.';
        } else {
          status.textContent = 'Produto não encontrado nas bases. Preencha à mão.';
        }
      })
      .catch(function () {
        ultimoCodigo = ''; // deu erro de rede: deixa tentar de novo
        status.textContent = 'Não foi possível buscar agora. Preencha à mão.';
      });
  }

  // O leitor de código de barras age como teclado e termina com Enter.
  campoCodigo.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault(); // não envia o formulário
      buscar();
    }
  });
  campoCodigo.addEventListener('change', buscar);
})();
