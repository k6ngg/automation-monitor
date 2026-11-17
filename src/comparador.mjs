import fs from 'node:fs';
import path from 'node:path';

/**
 * Gera chave única estável para identificar uma ocorrência entre execuções.
 *
 * @param {'DSI' | 'RNV'} sistema
 * @param {string} unidadeCode
 * @param {string} statusCode
 * @param {{ codigo?: string, raw?: string }} reg
 * @returns {string}
 */
export function gerarChaveOcorrencia(sistema, unidadeCode, statusCode, reg) {
  const codigo = String(reg?.codigo || '').trim();
  const tipo = String(reg?.cols?.[3] || '').trim();
  if (codigo) {
    return tipo
      ? `${sistema}|${unidadeCode}|${statusCode}|${codigo}|${tipo}`
      : `${sistema}|${unidadeCode}|${statusCode}|${codigo}`;
  }
  return `${sistema}|${unidadeCode}|${statusCode}|${String(reg?.raw || '').trim()}`;
}

/**
 * Lê o último snapshot salvo em disco. Retorna null se não existir ou estiver corrompido.
 *
 * @param {string} caminhoSnapshot
 * @param {{ warn?: (msg: string) => void }} [logger]
 */
export function carregarSnapshotAnterior(caminhoSnapshot, logger) {
  if (!fs.existsSync(caminhoSnapshot)) return null;
  try {
    const raw = fs.readFileSync(caminhoSnapshot, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.ocorrencias) {
      return null;
    }
    return parsed;
  } catch (err) {
    logger?.warn?.(`Aviso: snapshot anterior inválido em ${caminhoSnapshot} (${err.message}).`);
    return null;
  }
}

/**
 * Compara os resultados atuais com o snapshot anterior, anotando cada ocorrência
 * como 'nova' ou 'persistente' e calculando as ocorrências resolvidas.
 * Unidades que falharam na coleta atual não geram falsas 'resolvidas' e mantêm seu estado no snapshot.
 */
export function compararComSnapshot({
  resultadosDSI,
  resultadosRenave,
  falhasColeta = [],
  snapshotAnterior = null,
  geradoEm = '',
  timestampArquivo = '',
}) {
  const temComparacao = Boolean(snapshotAnterior && snapshotAnterior.ocorrencias);
  const prevMap = temComparacao ? snapshotAnterior.ocorrencias : {};
  const falhasSet = new Set(falhasColeta.map((f) => `${f.sistema}|${f.unidadeCode}`));

  const chavesAtuais = new Set();
  const novas = [];
  const persistentes = [];
  const novoMapaOcorrencias = {};

  function processarRegistro(sistema, unidade, statusCode, statusLabel, reg) {
    const chave = gerarChaveOcorrencia(sistema, unidade.code, statusCode, reg);
    chavesAtuais.add(chave);

    const prev = prevMap[chave];
    const situacaoDelta = temComparacao ? (prev ? 'persistente' : 'nova') : 'inicial';
    const primeiraVezEm = prev?.primeiraVezEm || (temComparacao && prev ? snapshotAnterior.geradoEm : geradoEm);

    const itemSnapshot = {
      chave,
      sistema,
      unidadeCode: unidade.code,
      unidadeNome: unidade.nome,
      grupo: unidade.grupo || null,
      statusCode,
      statusLabel,
      codigo: reg.codigo || '',
      integracao: reg.integracao || '',
      data: reg.data || '',
      detalhes: reg.detalhes || '',
      raw: reg.raw || '',
      primeiraVezEm,
    };

    novoMapaOcorrencias[chave] = itemSnapshot;

    if (temComparacao) {
      if (situacaoDelta === 'nova') novas.push(itemSnapshot);
      else persistentes.push(itemSnapshot);
    }

    return {
      ...reg,
      situacaoDelta,
      primeiraVezEm,
    };
  }

  const dsiAnotado = resultadosDSI.map((u) => {
    const novoPorStatus = {};
    for (const [stCode, bloco] of Object.entries(u.porStatus || {})) {
      novoPorStatus[stCode] = {
        ...bloco,
        registros: (bloco.registros || []).map((reg) =>
          processarRegistro('DSI', u, stCode, bloco.label, reg)
        ),
      };
    }
    return { ...u, porStatus: novoPorStatus };
  });

  const renaveAnotado = resultadosRenave.map((u) => ({
    ...u,
    ocorrencias: (u.ocorrencias || []).map((oc) =>
      processarRegistro('RNV', u, oc.statusCode, oc.statusLabel, oc)
    ),
  }));

  const resolvidas = [];
  if (temComparacao) {
    for (const [chave, prevItem] of Object.entries(prevMap)) {
      if (chavesAtuais.has(chave)) continue;

      const unidadeKey = `${prevItem.sistema}|${prevItem.unidadeCode}`;
      if (falhasSet.has(unidadeKey)) {
        // Preserva ocorrências de unidades não verificadas por erro de coleta
        novoMapaOcorrencias[chave] = prevItem;
        continue;
      }

      resolvidas.push(prevItem);
    }
  }

  return {
    resultadosDSI: dsiAnotado,
    resultadosRenave: renaveAnotado,
    comparacao: {
      temComparacao,
      geradoEmAnterior: snapshotAnterior?.geradoEm || null,
      totalNovas: novas.length,
      totalPersistentes: persistentes.length,
      totalResolvidas: resolvidas.length,
      novas,
      persistentes,
      resolvidas,
    },
    snapshotParaSalvar: {
      versao: 1,
      geradoEm,
      timestampArquivo,
      ocorrencias: novoMapaOcorrencias,
    },
  };
}

/**
 * Persiste o snapshot atual em disco.
 *
 * @param {string} caminhoSnapshot
 * @param {object} snapshot
 */
export function salvarSnapshot(caminhoSnapshot, snapshot) {
  fs.mkdirSync(path.dirname(caminhoSnapshot), { recursive: true });
  fs.writeFileSync(caminhoSnapshot, JSON.stringify(snapshot, null, 2), 'utf8');
}
