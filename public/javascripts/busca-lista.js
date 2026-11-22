/**
 * public/javascripts/busca-lista.js
 * Busca em lista suspensa com pesquisa gradual (vitrine e tela "Abrir venda").
 *
 * Como funciona, em passos:
 *  1. Procura os campos de busca marcados com `data-busca-lista` no HTML.
 *  2. Ao focar ou clicar no campo, abre uma lista suspensa com os produtos. No topo da lista há
 *     um campo de pesquisa próprio: a cada letra (com uma pequena espera, o "debounce") pede ao
 *     servidor a lista filtrada em GET /api/produtos?q=... (rota LOCAL, lê só o banco da loja).
 *  3. Escolher um produto (clique ou Enter):
 *       - se o campo tem `data-acao-post` (Abrir venda), envia um POST com perfumeId (adiciona à venda);
         produto COM variações volta para a tela filtrada pelo nome, onde se escolhe a variação;
 *       - senão (vitrine), abre a vitrine filtrada por aquele nome: "/?q=<nome>". É o jeito mais simples
 *         e sempre funciona, mesmo que o card esteja fora do filtro atual.
 *  4. Teclado: setas sobem/descem, Enter escolhe, Esc fecha. Clicar fora também fecha.
 *
 * Acessibilidade: padrão "combobox + listbox" (role, aria-expanded, aria-controls, aria-activedescendant).
 * Sem JS, o formulário de busca da página continua funcionando como antes (melhoria progressiva).
 * Segurança: os textos entram com textContent (nunca innerHTML), então não executam HTML.
 * Sem biblioteca externa. NÃO chama nenhuma API externa: só o servidor da própria loja.
 */
(function () {
  var ESPERA_MS = 200;                  // debounce: só busca depois de 200 ms sem digitar
  var SEM_FOTO = '/images/sem-foto.svg'; // desenho local usado quando a foto falha

  document.querySelectorAll('input[data-busca-lista]').forEach(iniciar);

  /** Liga a lista suspensa a UM campo de busca. */
  function iniciar(gatilho) {
    var url = gatilho.getAttribute('data-url');
    var acaoPost = gatilho.getAttribute('data-acao-post'); // vazio na vitrine
    var uid = 'busca-' + Math.random().toString(36).slice(2, 8); // ids únicos para o ARIA
    var aberta = false;
    var ativo = -1;          // posição da opção marcada pelo teclado (-1 = nenhuma)
    var opcoes = [];         // elementos <li> atuais
    var dados = [];          // produtos atuais (mesma ordem de `opcoes`)
    var temporizador = null; // debounce
    var pedido = 0;          // numera as buscas: resposta velha é ignorada
    var devolvendoFoco = false; // evita reabrir ao devolver o foco ao campo original

    // Envolve o campo original num <span> "relative", para a lista ficar logo abaixo dele.
    var caixa = document.createElement('span');
    caixa.className = 'busca-lista';
    gatilho.parentNode.insertBefore(caixa, gatilho);
    caixa.appendChild(gatilho);
    gatilho.setAttribute('aria-haspopup', 'listbox');
    gatilho.setAttribute('aria-expanded', 'false');

    // Painel: campo de pesquisa embutido + lista com rolagem + aviso.
    var painel = document.createElement('div');
    painel.className = 'busca-painel';
    painel.hidden = true;

    var campo = document.createElement('input');
    campo.type = 'search';
    campo.className = 'busca-painel-campo';
    campo.placeholder = 'Pesquisar por nome';
    campo.maxLength = 80;
    campo.autocomplete = 'off';
    campo.setAttribute('role', 'combobox');
    campo.setAttribute('aria-label', 'Pesquisar produto por nome');
    campo.setAttribute('aria-autocomplete', 'list');
    campo.setAttribute('aria-expanded', 'false');
    campo.setAttribute('aria-controls', uid + '-lista');

    var lista = document.createElement('ul');
    lista.id = uid + '-lista';
    lista.className = 'busca-opcoes';
    lista.setAttribute('role', 'listbox');
    lista.setAttribute('aria-label', 'Produtos');

    var aviso = document.createElement('p');
    aviso.className = 'busca-aviso';
    aviso.setAttribute('role', 'status'); // leitor de tela anuncia "Nenhum produto encontrado"
    aviso.hidden = true;

    painel.appendChild(campo);
    painel.appendChild(lista);
    painel.appendChild(aviso);
    caixa.appendChild(painel);

    /** Abre a lista, copia o texto do campo original e busca. */
    function abrir() {
      if (aberta) return;
      aberta = true;
      painel.hidden = false;
      gatilho.setAttribute('aria-expanded', 'true');
      campo.setAttribute('aria-expanded', 'true');
      campo.value = gatilho.value;
      buscar();
      campo.focus();
    }

    /** Fecha a lista. `devolverFoco` volta o cursor para o campo original. */
    function fechar(devolverFoco) {
      if (!aberta) return;
      aberta = false;
      painel.hidden = true;
      gatilho.setAttribute('aria-expanded', 'false');
      campo.setAttribute('aria-expanded', 'false');
      campo.removeAttribute('aria-activedescendant');
      ativo = -1;
      clearTimeout(temporizador);
      if (devolverFoco) {
        devolvendoFoco = true;
        gatilho.focus();
        devolvendoFoco = false;
      }
    }

    /** Pede a lista ao servidor (rota local) e desenha o resultado. */
    function buscar() {
      var numero = ++pedido;
      var texto = campo.value.trim();
      var endereco = url + (url.indexOf('?') === -1 ? '?' : '&') + 'q=' + encodeURIComponent(texto);
      fetch(endereco, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (produtos) {
          if (numero === pedido) desenhar(produtos); // ignora resposta de busca antiga
        })
        .catch(function () {
          if (numero === pedido) desenhar(null);
        });
    }

    /** Monta as linhas (nome, marca, preço e foto pequena). `null` = erro de rede. */
    function desenhar(produtos) {
      lista.textContent = '';
      opcoes = [];
      dados = produtos || [];
      ativo = -1;
      campo.removeAttribute('aria-activedescendant');
      dados.forEach(function (p, i) {
        var li = document.createElement('li');
        li.id = uid + '-op-' + i;
        li.className = 'busca-opcao';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');

        var foto = document.createElement('img');
        foto.className = 'busca-foto';
        foto.alt = ''; // decorativa: o nome já está no texto ao lado
        foto.width = 32;
        foto.height = 32;
        foto.src = p.fotoUrl || SEM_FOTO;
        foto.onerror = function () { foto.onerror = null; foto.src = SEM_FOTO; };

        var texto = document.createElement('span');
        texto.className = 'busca-texto';
        var nome = document.createElement('strong');
        nome.textContent = p.nome;
        var marca = document.createElement('small');
        marca.textContent = p.sku ? p.marca + ' · SKU ' + p.sku : p.marca; // a busca também acha pelo SKU
        texto.appendChild(nome);
        texto.appendChild(marca);

        var preco = document.createElement('span');
        preco.className = 'busca-preco';
        preco.textContent = p.precoTexto;

        li.appendChild(foto);
        li.appendChild(texto);
        li.appendChild(preco);
        li.addEventListener('click', function () { escolher(i); });
        li.addEventListener('mousemove', function () { marcar(i); }); // o mouse também marca a linha
        lista.appendChild(li);
        opcoes.push(li);
      });
      if (produtos === null) {
        aviso.textContent = 'Não foi possível carregar os produtos.';
      } else {
        aviso.textContent = dados.length ? '' : 'Nenhum produto encontrado';
      }
      aviso.hidden = !aviso.textContent;
    }

    /** Marca a opção `i` (cor + aria-activedescendant) e a traz para a área visível da rolagem. */
    function marcar(i) {
      if (ativo === i) return;
      if (opcoes[ativo]) {
        opcoes[ativo].classList.remove('ativa');
        opcoes[ativo].setAttribute('aria-selected', 'false');
      }
      ativo = i;
      if (opcoes[i]) {
        opcoes[i].classList.add('ativa');
        opcoes[i].setAttribute('aria-selected', 'true');
        campo.setAttribute('aria-activedescendant', opcoes[i].id);
        opcoes[i].scrollIntoView({ block: 'nearest' });
      } else {
        campo.removeAttribute('aria-activedescendant');
      }
    }

    /** Executa a escolha: POST (Abrir venda) ou vitrine filtrada. */
    function escolher(i) {
      var p = dados[i];
      if (!p) return;
      if (acaoPost && p.temVariacoes) {
        // Produto com variações: precisa escolher a variação antes. A tela de venda lista o produto
        // (busca por nome) com o seletor de variação ao lado do botão "Adicionar".
        window.location.href = window.location.pathname + '?q=' + encodeURIComponent(p.nome);
      } else if (acaoPost) {
        var form = document.createElement('form');
        form.method = 'post';
        form.action = acaoPost;
        var id = document.createElement('input');
        id.type = 'hidden';
        id.name = 'perfumeId';
        id.value = String(p.id);
        form.appendChild(id);
        document.body.appendChild(form);
        form.submit();
      } else {
        window.location.href = '/?q=' + encodeURIComponent(p.nome);
      }
    }

    // Abrir: foco ou clique no campo original (o foco passa para o campo de pesquisa do painel).
    gatilho.addEventListener('focus', function () { if (!devolvendoFoco) abrir(); });
    gatilho.addEventListener('click', abrir);

    // Pesquisa gradual: a cada letra, espera 200 ms e busca de novo.
    campo.addEventListener('input', function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(buscar, ESPERA_MS);
    });

    // Teclado.
    campo.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (opcoes.length) marcar(ativo + 1 >= opcoes.length ? 0 : ativo + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (opcoes.length) marcar(ativo <= 0 ? opcoes.length - 1 : ativo - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault(); // não deixa o Enter enviar o formulário da página
        if (ativo >= 0) escolher(ativo);
        else if (opcoes.length) escolher(0);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        fechar(true);
      } else if (e.key === 'Tab') {
        if (e.shiftKey) { // Shift+Tab iria cair no campo original e reabrir a lista: devolve o foco sem reabrir
          e.preventDefault();
          fechar(true);
        } else {
          fechar(false); // Tab segue para o próximo elemento da página
        }
      }
    });

    // Clicar fora fecha.
    document.addEventListener('mousedown', function (e) {
      if (aberta && !caixa.contains(e.target)) fechar(false);
    });
  }
})();
