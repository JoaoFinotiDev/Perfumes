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
 *       - se o campo tem `data-acao-post` (Abrir venda):
 *           * produto SEM variações: envia um POST com perfumeId (adiciona à venda);
 *           * produto COM variações: NÃO adiciona. Mostra logo abaixo a SEGUNDA busca (variação), que é
 *             o mesmo tipo de lista, mas filtra no navegador as variações vindas de
 *             GET /api/produtos/:id/variacoes. Escolher a variação envia o POST (perfumeId + variacaoId + quantidade).
 *             O botão "Trocar produto" limpa a escolha e devolve o foco à primeira busca;
 *       - senão (vitrine), abre a vitrine filtrada por aquele nome: "/?q=<nome>". É o jeito mais simples
 *         e sempre funciona, mesmo que o card esteja fora do filtro atual.
 *  4. Teclado: setas sobem/descem (pulam opções desativadas), Enter escolhe, Esc fecha. Clicar fora também fecha.
 *
 * Acessibilidade: padrão "combobox + listbox" (role, aria-expanded, aria-controls, aria-activedescendant,
 * aria-disabled nas variações esgotadas).
 * Sem JS, o formulário de busca da página continua funcionando como antes (melhoria progressiva):
 * a segunda busca fica escondida (atributo hidden) e a tela usa o select de variação da tabela de resultados.
 * Segurança: os textos entram com textContent (nunca innerHTML), então não executam HTML.
 * Sem biblioteca externa. NÃO chama nenhuma API externa: só o servidor da própria loja.
 */
(function () {
  var ESPERA_MS = 200;                  // debounce: só busca depois de 200 ms sem digitar
  var SEM_FOTO = '/images/sem-foto.svg'; // desenho local usado quando a foto falha

  document.querySelectorAll('input[data-busca-lista]').forEach(iniciarProdutos);

  /** Tira acentos e maiúsculas ("Açaí" vira "acai"), para o filtro das variações ignorá-los. */
  function normalizar(texto) {
    return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /** Pede JSON a uma rota local. Erro de rede ou resposta ruim viram uma Promise rejeitada. */
  function pedirJson(endereco) {
    return fetch(endereco, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  /** Envia um POST de formulário (a página recarrega mostrando a venda atualizada). `campos` = { nome: valor }. */
  function enviarPost(acao, campos) {
    var form = document.createElement('form');
    form.method = 'post';
    form.action = acao;
    Object.keys(campos).forEach(function (nome) {
      var campo = document.createElement('input');
      campo.type = 'hidden';
      campo.name = nome;
      campo.value = String(campos[nome]);
      form.appendChild(campo);
    });
    document.body.appendChild(form);
    form.submit();
  }

  /** Liga a PRIMEIRA busca (produtos) a um campo e, se existir, prepara a segunda (variações). */
  function iniciarProdutos(gatilho) {
    var url = gatilho.getAttribute('data-url');
    var acaoPost = gatilho.getAttribute('data-acao-post');       // vazio na vitrine
    var modeloVariacoes = gatilho.getAttribute('data-variacoes-url'); // ex.: /api/produtos/{id}/variacoes
    var bloco = document.getElementById(gatilho.getAttribute('data-variacoes-bloco') || '');
    var combo = null;

    // A segunda busca só existe na tela "Abrir venda" (bloco presente no HTML).
    var variacoes = acaoPost && modeloVariacoes && bloco
      ? iniciarVariacoes(bloco, acaoPost, function trocarProduto() {
        gatilho.value = '';
        gatilho.focus(); // o foco volta ao campo de produto e a lista abre de novo
      })
      : null;

    combo = criarCombobox(gatilho, {
      tituloLista: 'Produtos',
      placeholder: 'Pesquisar por nome',
      ariaCampo: 'Pesquisar produto por nome',
      vazio: 'Nenhum produto encontrado',
      erro: 'Não foi possível carregar os produtos.',
      comEspera: true, // consulta o servidor: espera o usuário parar de digitar
      buscar: function (texto) {
        return pedirJson(url + (url.indexOf('?') === -1 ? '?' : '&') + 'q=' + encodeURIComponent(texto));
      },
      linha: linhaDeProduto,
      escolher: function (p) {
        if (acaoPost && p.temVariacoes && variacoes) {
          // Produto com variações: não adiciona ainda. Mostra a segunda busca logo abaixo.
          combo.fechar(false);
          gatilho.value = p.nome;
          variacoes.mostrar(p, modeloVariacoes.replace('{id}', encodeURIComponent(p.id)));
        } else if (acaoPost && p.temVariacoes) {
          // Sem a segunda busca no HTML: cai na tela filtrada pelo nome (select de variação da tabela).
          window.location.href = window.location.pathname + '?q=' + encodeURIComponent(p.nome);
        } else if (acaoPost) {
          enviarPost(acaoPost, { perfumeId: p.id }); // produto simples: adiciona direto
        } else {
          window.location.href = '/?q=' + encodeURIComponent(p.nome);
        }
      }
    });
  }

  /** Desenha uma linha de produto: foto 40x40, nome (até 2 linhas), marca/SKU embaixo e preço à direita. */
  function linhaDeProduto(li, p) {
    var foto = document.createElement('img');
    foto.className = 'busca-foto';
    foto.alt = ''; // decorativa: o nome já está no texto ao lado
    foto.width = 40;
    foto.height = 40;
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
  }

  /**
   * Prepara a SEGUNDA busca (variações) dentro do bloco `#...` da tela "Abrir venda".
   * Devolve { mostrar(produto, urlDasVariacoes) }.
   * O bloco traz: o campo de variação, um rótulo, a quantidade e o botão "Trocar produto".
   */
  function iniciarVariacoes(bloco, acaoPost, aoTrocar) {
    var campoVariacao = bloco.querySelector('input[data-busca-variacao]');
    var rotulo = bloco.querySelector('[data-variacao-rotulo]');
    var quantidade = bloco.querySelector('input[data-variacao-quantidade]');
    var botaoTrocar = bloco.querySelector('[data-trocar-produto]');
    var produto = null;                    // produto escolhido na primeira busca
    var carregamento = Promise.resolve([]); // variações do produto (chegam do servidor)

    var combo = criarCombobox(campoVariacao, {
      tituloLista: 'Variações',
      placeholder: 'Pesquisar variação',
      ariaCampo: 'Pesquisar variação do produto',
      vazio: 'Nenhuma variação encontrada',
      erro: 'Não foi possível carregar as variações.',
      comEspera: false, // filtra na memória: pode responder a cada letra, sem esperar
      // Filtra por descrição, ignorando maiúsculas e acentos. A ordem (natural: 9, 14, 23...) já vem do servidor.
      buscar: function (texto) {
        var procurado = normalizar(texto.trim());
        return carregamento.then(function (lista) {
          return lista.filter(function (v) { return normalizar(v.descricao).indexOf(procurado) !== -1; });
        });
      },
      desativada: function (v) { return v.esgotada; }, // esgotada aparece, mas não pode ser escolhida
      linha: function (li, v) {
        var texto = document.createElement('span');
        texto.className = 'busca-texto';
        var nome = document.createElement('strong');
        nome.textContent = v.descricao + (v.esgotada ? ' (esgotado)' : '');
        var estoque = document.createElement('small');
        estoque.textContent = v.esgotada ? 'Sem estoque' : v.estoque + ' em estoque';
        texto.appendChild(nome);
        texto.appendChild(estoque);
        var preco = document.createElement('span');
        preco.className = 'busca-preco';
        preco.textContent = v.precoTexto;
        li.appendChild(texto);
        li.appendChild(preco);
      },
      // Escolheu a variação: adiciona produto + variação à venda (mesmo POST de sempre).
      escolher: function (v) {
        var qtd = parseInt(quantidade.value, 10);
        enviarPost(acaoPost, {
          perfumeId: produto.id, variacaoId: v.id, quantidade: qtd > 0 ? qtd : 1
        });
      }
    });

    botaoTrocar.addEventListener('click', function () {
      combo.fechar(false);
      bloco.hidden = true;
      produto = null;
      aoTrocar();
    });

    return {
      mostrar: function (p, urlDasVariacoes) {
        produto = p;
        rotulo.textContent = 'Variação de ' + p.nome;
        campoVariacao.value = '';
        quantidade.value = '1';
        carregamento = pedirJson(urlDasVariacoes);
        carregamento.catch(function () {}); // o erro aparece na lista (quem busca trata); aqui só evita aviso solto
        bloco.hidden = false;
        campoVariacao.focus(); // o foco abre a lista de variações
      }
    };
  }

  /**
   * Cria uma lista suspensa (combobox) em volta de UM campo. Serve às duas buscas.
   * `cfg` descreve o que muda de uma para outra:
   *   tituloLista, placeholder, ariaCampo, vazio, erro: textos;
   *   comEspera: usa debounce (busca no servidor) ou responde na hora (filtro local);
   *   buscar(texto): devolve uma Promise com a lista de itens;
   *   linha(li, item): preenche o <li> de um item;
   *   desativada(item) (opcional): item que aparece mas não pode ser escolhido;
   *   escolher(item): o que fazer ao escolher.
   * Devolve { fechar(devolverFoco) }.
   */
  function criarCombobox(gatilho, cfg) {
    var uid = 'busca-' + Math.random().toString(36).slice(2, 8); // ids únicos para o ARIA
    var aberta = false;
    var ativo = -1;          // posição da opção marcada pelo teclado (-1 = nenhuma)
    var opcoes = [];         // elementos <li> atuais
    var dados = [];          // itens atuais (mesma ordem de `opcoes`)
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
    campo.placeholder = cfg.placeholder;
    campo.maxLength = 80;
    campo.autocomplete = 'off';
    campo.setAttribute('role', 'combobox');
    campo.setAttribute('aria-label', cfg.ariaCampo);
    campo.setAttribute('aria-autocomplete', 'list');
    campo.setAttribute('aria-expanded', 'false');
    campo.setAttribute('aria-controls', uid + '-lista');

    var lista = document.createElement('ul');
    lista.id = uid + '-lista';
    lista.className = 'busca-opcoes';
    lista.setAttribute('role', 'listbox');
    lista.setAttribute('aria-label', cfg.tituloLista);

    var aviso = document.createElement('p');
    aviso.className = 'busca-aviso';
    aviso.setAttribute('role', 'status'); // leitor de tela anuncia "Nenhum produto encontrado"
    aviso.hidden = true;

    painel.appendChild(campo);
    painel.appendChild(lista);
    painel.appendChild(aviso);
    caixa.appendChild(painel);

    /** A opção `i` existe e pode ser escolhida? (variação esgotada não pode) */
    function habilitada(i) {
      return Boolean(dados[i]) && !(cfg.desativada && cfg.desativada(dados[i]));
    }

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

    /** Pede os itens (ao servidor ou à memória, conforme `cfg.buscar`) e desenha o resultado. */
    function buscar() {
      var numero = ++pedido;
      cfg.buscar(campo.value.trim())
        .then(function (itens) {
          if (numero === pedido) desenhar(itens); // ignora resposta de busca antiga
        })
        .catch(function () {
          if (numero === pedido) desenhar(null);
        });
    }

    /** Monta as linhas. `null` = erro de rede. */
    function desenhar(itens) {
      lista.textContent = '';
      opcoes = [];
      dados = itens || [];
      ativo = -1;
      campo.removeAttribute('aria-activedescendant');
      dados.forEach(function (item, i) {
        var li = document.createElement('li');
        li.id = uid + '-op-' + i;
        li.className = 'busca-opcao';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        if (!habilitada(i)) li.setAttribute('aria-disabled', 'true'); // fica visível, mas sem clique
        cfg.linha(li, item);
        li.addEventListener('click', function () { escolher(i); });
        li.addEventListener('mousemove', function () { if (habilitada(i)) marcar(i); }); // o mouse também marca a linha
        lista.appendChild(li);
        opcoes.push(li);
      });
      aviso.textContent = itens === null ? cfg.erro : (dados.length ? '' : cfg.vazio);
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

    /** Anda `passo` (+1 ou -1) para a próxima opção habilitada, dando a volta no fim da lista. */
    function andar(passo) {
      var base = ativo >= 0 ? ativo : (passo > 0 ? -1 : 0); // sem marcação: ↓ vai à primeira, ↑ à última
      for (var n = 1; n <= opcoes.length; n++) {
        var i = (base + passo * n + opcoes.length * n) % opcoes.length;
        if (habilitada(i)) return marcar(i);
      }
    }

    /** Executa a escolha da opção `i` (opção desativada é ignorada). */
    function escolher(i) {
      if (habilitada(i)) cfg.escolher(dados[i]);
    }

    // Abrir: foco ou clique no campo original (o foco passa para o campo de pesquisa do painel).
    gatilho.addEventListener('focus', function () { if (!devolvendoFoco) abrir(); });
    gatilho.addEventListener('click', abrir);

    // Pesquisa gradual: a cada letra busca de novo (no servidor, com espera de 200 ms; na memória, na hora).
    campo.addEventListener('input', function () {
      clearTimeout(temporizador);
      if (cfg.comEspera) temporizador = setTimeout(buscar, ESPERA_MS);
      else buscar();
    });

    // Teclado.
    campo.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        andar(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        andar(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault(); // não deixa o Enter enviar o formulário da página
        if (ativo >= 0) return escolher(ativo);
        for (var i = 0; i < opcoes.length; i++) { // sem marcação: escolhe a primeira opção habilitada
          if (habilitada(i)) return escolher(i);
        }
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

    return { fechar: fechar };
  }
})();
