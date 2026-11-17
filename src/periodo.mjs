/**
 * Calcula o período de consulta (1º dia do mês atual 00:00 até hoje 23:59)
 * e os carimbos de data/hora usados nos relatórios e arquivos gerados.
 *
 * @param {Date} [agora]
 * @param {Record<string, string | undefined>} [env]
 */
export function obterPeriodoMesAtual(agora = new Date(), env = process.env) {
  const dia = String(agora.getDate()).padStart(2, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const ano = agora.getFullYear();
  const hora = String(agora.getHours()).padStart(2, '0');
  const min = String(agora.getMinutes()).padStart(2, '0');

  return {
    dataHojePrefixo: `${dia}/${mes}/${ano}`,
    dataInicio: env.DATA_INICIO || `01/${mes}/${ano} 00:00`,
    dataFim: env.DATA_FIM || `${dia}/${mes}/${ano} 23:59`,
    geradoEm: `${dia}/${mes}/${ano} às ${hora}:${min}`,
    timestampArquivo: `${ano}-${mes}-${dia}_${hora}-${min}`,
  };
}
