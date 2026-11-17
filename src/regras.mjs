/**
 * Regras puras de negócio, normalização de texto e parsing de tabelas do Monitor DealerNet.
 */

/**
 * Remove diacríticos/acentos, converte para minúsculas e remove espaços nas pontas.
 *
 * @param {string} [str]
 * @returns {string}
 */
export function normalizarTexto(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Verifica se alguma coluna da linha corresponde ao status buscado,
 * ignorando diferenças de acentuação e maiúsculas/minúsculas.
 *
 * @param {string[]} [cols]
 * @param {string} [statusLabel]
 * @returns {boolean}
 */
export function statusCorresponde(cols = [], statusLabel = '') {
  const alvo = normalizarTexto(statusLabel);
  if (!alvo) return false;
  return cols.some((col) => normalizarTexto(col) === alvo);
}

/**
 * Identifica se a unidade pertence ao grupo JADE (NDI Nissan).
 * A regra de desprezar Ficha GAMA do dia atual aplica-se somente às unidades JADE.
 *
 * @param {{ nome?: string, grupo?: string } | null | undefined} unidade
 * @returns {boolean}
 */
export function ehUnidadeJade(unidade) {
  if (!unidade) return false;
  return unidade.grupo === 'NDI Nissan' || /^JADE\b/i.test(String(unidade.nome || '').trim());
}

/**
 * Determina se um registro deve ser ignorado pela regra da Ficha GAMA do dia:
 * aplica-se apenas quando ativo, em unidades JADE, contendo "Ficha Gama"
 * e cuja coluna Data inicia com a data de hoje (DD/MM/YYYY).
 *
 * @param {{ raw?: string, data?: string } | null | undefined} reg
 * @param {{ nome?: string, grupo?: string } | null | undefined} unidade
 * @param {string} dataHojePrefixo
 * @param {boolean} [desprezarAtivo]
 * @returns {boolean}
 */
export function deveDesprezarFichaGama(reg, unidade, dataHojePrefixo, desprezarAtivo = true) {
  if (!desprezarAtivo || !ehUnidadeJade(unidade)) return false;
  const ehFichaGama = /ficha\s*gama/i.test(String(reg?.raw || ''));
  const ehDeHoje = String(reg?.data || '').trim().startsWith(dataHojePrefixo);
  return ehFichaGama && ehDeHoje;
}

/**
 * Extrai os registros tabulares a partir do innerText do iframe wwmonitorsistema.aspx.
 *
 * @param {string} [bodyText]
 * @returns {Array<{ raw: string, cols: string[], codigo: string, integracao: string, data: string, detalhes: string }>}
 */
export function parsearLinhasTabela(bodyText = '') {
  const texto = String(bodyText || '');
  const matchCabecalho = texto.match(/C[óo]digo\tIntegra[çc][ãa]o\tData/i);
  if (!matchCabecalho || matchCabecalho.index === undefined) return [];

  const tablePart = texto.slice(matchCabecalho.index);
  const rawLines = tablePart
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const dataLines = rawLines.slice(1).filter((line) => /^\d+\t/.test(line));

  return dataLines.map((line) => {
    const cols = line.split('\t').map((c) => c.trim());
    return {
      raw: line,
      cols,
      codigo: cols[0] || '',
      integracao: cols[1] || '',
      data: cols[2] || '',
      detalhes: cols.slice(3).join(' | '),
    };
  });
}

/**
 * Soma contagens por status de uma unidade DSI para reutilização entre relatórios.
 *
 * @param {object} unidade
 * @param {Array<{ code: string, label: string }>} statusAlvo
 */
export function contarPorStatusDSI(unidade, statusAlvo) {
  let total = 0;
  const porCodigo = {};

  for (const st of statusAlvo) {
    const bloco = unidade.porStatus?.[st.code] || { registros: [], atingiuLimitePaginas: false };
    const qtd = bloco.registros.length;
    total += qtd;
    porCodigo[st.code] = {
      qtd,
      texto: `${qtd}${bloco.atingiuLimitePaginas ? '+' : ''}`,
      atingiuLimitePaginas: Boolean(bloco.atingiuLimitePaginas),
    };
  }

  return { porCodigo, total };
}

/**
 * Consolida totais gerais de uma execução para uso no resumo, e-mail e código de saída.
 *
 * @param {Array} resultadosDSI
 * @param {Array} resultadosRenave
 * @param {Array} [falhasColeta]
 */
export function resumirExecucao(resultadosDSI, resultadosRenave, falhasColeta = []) {
  let totalOcorrenciasDSI = 0;
  let totalDesprezadasFichaGama = 0;

  for (const u of resultadosDSI) {
    totalDesprezadasFichaGama += u.desprezadosFichaGamaHoje || 0;
    for (const bloco of Object.values(u.porStatus || {})) {
      totalOcorrenciasDSI += bloco?.registros?.length || 0;
    }
  }

  let totalOcorrenciasRenave = 0;
  for (const u of resultadosRenave) {
    totalOcorrenciasRenave += u.ocorrencias?.length || 0;
  }

  return {
    totalOcorrenciasDSI,
    totalOcorrenciasRenave,
    totalOcorrencias: totalOcorrenciasDSI + totalOcorrenciasRenave,
    totalDesprezadasFichaGama,
    totalFalhas: falhasColeta.length,
  };
}
