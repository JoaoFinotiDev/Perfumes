/**
 * utils/html.js
 * Limpeza de texto HTML compartilhada pelos importadores (Mawwal, Queen...):
 * tira as tags e troca entidades (&ccedil; vira ç) pelos caracteres de verdade.
 * Fica em utils para o mesmo código não ser copiado em cada importador.
 */

// Entidades HTML com nome que aparecem nos textos em portugues. Nome da entidade -> caractere.
const ENTIDADES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã',
  egrave: 'è', eacute: 'é', ecirc: 'ê', Eacute: 'É', Ecirc: 'Ê',
  iacute: 'í', Iacute: 'Í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ',
  uacute: 'ú', uuml: 'ü', Uacute: 'Ú', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ',
  ordm: 'º', ordf: 'ª', ndash: '-', mdash: '-', hellip: '...', lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"'
};

/**
 * Troca entidades HTML pelo caractere de verdade: &ccedil; (nome), &#233; (decimal) e &#xE9; (hexadecimal).
 * Passa UMA vez pelo texto, então "&amp;ccedil;" vira "&ccedil;" (não decodifica duas vezes).
 * Entidade desconhecida fica como veio.
 */
function decodificarEntidades(texto) {
  return String(texto).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (inteira, corpo) => {
    if (corpo[0] === '#') {
      const codigo = corpo[1].toLowerCase() === 'x' ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10);
      return codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : inteira;
    }
    return Object.prototype.hasOwnProperty.call(ENTIDADES, corpo) ? ENTIDADES[corpo] : inteira;
  });
}

/** Tira as tags HTML, decodifica as entidades (&ccedil; vira ç) e junta espaços repetidos. */
function limparHtml(html) {
  const semTags = String(html || '').replace(/<[^>]*>/g, ' ');
  return decodificarEntidades(semTags).replace(/\s+/g, ' ').trim();
}

module.exports = { decodificarEntidades, limparHtml };
