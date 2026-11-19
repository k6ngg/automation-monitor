import { chromium } from 'playwright';
import { ORDEM_REENVIO_TOYOTA, STATUS_ALVO } from '../config.mjs';
import { diagnosticarOcorrencia, gerarPlaybookResumo } from './diagnosticador.mjs';
import { contarPorStatusDSI } from './regras.mjs';

export function escaparHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatarDeltaHtml(item, comparacao) {
  if (!comparacao?.temComparacao) return '';
  if (item.situacaoDelta === 'nova') {
    return `<span class="badge badge-nova">Nova</span>`;
  }
  if (item.situacaoDelta === 'persistente') {
    const titulo = item.primeiraVezEm ? ` title="Desde ${escaparHtml(item.primeiraVezEm)}"` : '';
    return `<span class="badge badge-persistente"${titulo}>Persistente</span>`;
  }
  return '';
}

function formatarDeltaTexto(item, comparacao) {
  if (!comparacao?.temComparacao) return '';
  if (item.situacaoDelta === 'nova') return '[NOVA] ';
  if (item.situacaoDelta === 'persistente') {
    return item.primeiraVezEm ? `[PERSISTENTE desde ${item.primeiraVezEm}] ` : '[PERSISTENTE] ';
  }
  return '';
}

function renderizarBlocoComparacaoHtml(comparacao) {
  if (!comparacao) return '';
  if (!comparacao.temComparacao) {
    return `<div class="info-box">Primeira execução registrada neste ambiente — linha de base salva para detectar ocorrências novas, persistentes e resolvidas a partir da próxima verificação.</div>`;
  }
  return `
    <div class="diff-summary">
      <span><strong>Comparação com ${escaparHtml(comparacao.geradoEmAnterior || 'execução anterior')}:</strong></span>
      <span class="badge badge-nova">Novas: ${comparacao.totalNovas}</span>
      <span class="badge badge-persistente">Persistentes: ${comparacao.totalPersistentes}</span>
      <span class="badge badge-ok">Resolvidas: ${comparacao.totalResolvidas}</span>
    </div>
  `;
}

function renderizarFalhasHtml(falhasColeta = []) {
  if (!falhasColeta.length) return '';
  const itens = falhasColeta
    .map(
      (f) => `
      <li>
        <strong>[${escaparHtml(f.sistema)}] ${escaparHtml(f.unidadeNome)}</strong>:
        ${escaparHtml(f.erro)}
        ${f.screenshot ? `<span class="muted"> (evidência: ${escaparHtml(f.screenshot)})</span>` : ''}
      </li>`
    )
    .join('');

  return `
    <div class="fail-box">
      <strong>ALERTA: ${falhasColeta.length} unidade(s) não puderam ser verificadas por falha na consulta</strong>
      <ul>${itens}</ul>
    </div>
  `;
}

function obterDiagnostico(reg, contexto) {
  return reg?.diagnostico || diagnosticarOcorrencia(reg, contexto);
}

function formatarCelulaDiagnosticoHtml(reg, contexto) {
  const diag = obterDiagnostico(reg, contexto);
  const ordemHtml = diag.ordemPrecedencia
    ? `<span class="badge badge-ordem">${escaparHtml(diag.ordemPrecedencia)}</span>`
    : '';
  return `
    <div>
      <span class="badge ${escaparHtml(diag.badgeClass)}">${escaparHtml(diag.acaoLabel)}</span>
      ${ordemHtml}
    </div>
    <div style="margin-top:3px;"><strong>${escaparHtml(diag.titulo)}</strong></div>
  `;
}

function renderizarPlaybookHtml(playbook = []) {
  if (!playbook.length) {
    return `
      <h2>4. Plano de Ação e Resolução Consolidado (Doc. Dealernet)</h2>
      <p class="ok-box">Nenhuma ocorrência pendente para ação corretiva no período.</p>
    `;
  }

  const cartoes = playbook
    .map((item) => {
      const ordemHtml = item.ordemPrecedencia
        ? `<span class="badge badge-ordem">${escaparHtml(item.ordemPrecedencia)}</span>`
        : '';
      const amostras = item.chavesAmostra.length
        ? `<div><strong>Chaves/Amostras:</strong> <code>${item.chavesAmostra.map(escaparHtml).join('</code>, <code>')}</code></div>`
        : '';

      return `
        <div class="playbook-card">
          <div class="playbook-header">
            <div>
              <span class="badge ${escaparHtml(item.badgeClass)}">${escaparHtml(item.acaoLabel)}</span>
              ${ordemHtml}
              <strong>${escaparHtml(item.titulo)}</strong>
            </div>
            <span class="badge badge-count">${item.totalOcorrencias} ocorrência(s)</span>
          </div>
          <div class="playbook-body">
            <div><strong>Unidades afetadas:</strong> ${escaparHtml(item.unidades.join(', '))}</div>
            ${amostras}
            <div><strong>Causa (Doc. Dealernet):</strong> ${escaparHtml(item.causa)}</div>
            <div><strong>Como resolver:</strong> ${escaparHtml(item.passosResolucao)}</div>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <h2>4. Plano de Ação e Resolução Consolidado — Doc. Dealernet (${playbook.length} tipo(s))</h2>
    ${cartoes}
  `;
}

function renderizarResolvidasHtml(comparacao) {
  if (!comparacao?.temComparacao || !comparacao.resolvidas?.length) return '';
  const linhas = comparacao.resolvidas
    .map(
      (r) => `
      <tr>
        <td>${escaparHtml(r.sistema)}</td>
        <td><strong>${escaparHtml(r.unidadeNome)}</strong></td>
        <td><span class="badge badge-ok">${escaparHtml(r.statusLabel)}</span></td>
        <td><code>${escaparHtml(r.codigo)}</code></td>
        <td>${escaparHtml(r.data)}</td>
        <td class="detalhes">${escaparHtml(r.detalhes || r.raw)}</td>
      </tr>`
    )
    .join('');

  return `
    <h2>5. Ocorrências Resolvidas Desde a Última Execução (${comparacao.resolvidas.length})</h2>
    <table class="detail-table">
      <thead>
        <tr>
          <th style="width:65px">Sistema</th>
          <th style="width:165px">Unidade</th>
          <th style="width:120px">Status Anterior</th>
          <th style="width:85px">Código</th>
          <th style="width:120px">Data</th>
          <th>Detalhes</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  `;
}

/**
 * Gera o relatório completo em HTML estilizado (usado no PDF e no corpo do e-mail).
 */
export function gerarRelatorioHtml(periodo, resultadosDSI, resultadosRenave, opcoes = {}) {
  const { comparacao = null, falhasColeta = [] } = opcoes;
  const playbook = gerarPlaybookResumo(resultadosDSI, resultadosRenave);

  const linhasResumoDSI = resultadosDSI
    .map((u) => {
      const { porCodigo, total } = contarPorStatusDSI(u, STATUS_ALVO);
      const statusGeral =
        total === 0
          ? `<span class="badge badge-ok">OK</span>`
          : `<span class="badge badge-warn">Verificar (${total})</span>`;

      return `
        <tr>
          <td><strong>${escaparHtml(u.nome)}</strong></td>
          <td>${escaparHtml(u.grupo)}</td>
          <td class="num ${porCodigo.ERR.qtd > 0 ? 'cell-err' : ''}">${porCodigo.ERR.texto}</td>
          <td class="num ${porCodigo.OUT.qtd > 0 ? 'cell-out' : ''}">${porCodigo.OUT.texto}</td>
          <td class="num ${porCodigo.INC.qtd > 0 ? 'cell-inc' : ''}">${porCodigo.INC.texto}</td>
          <td class="num ${porCodigo.PEN.qtd > 0 ? 'cell-pen' : ''}">${porCodigo.PEN.texto}</td>
          <td class="num">${u.desprezadosFichaGamaHoje || 0}</td>
          <td class="center">${statusGeral}</td>
        </tr>
      `;
    })
    .join('');

  const blocosDetalhesDSI = resultadosDSI
    .map((u) => {
      const itens = [];
      let ocultos = 0;

      for (const st of STATUS_ALVO) {
        const regs = u.porStatus[st.code]?.registros || [];
        if (regs.length > 15) ocultos += regs.length - 15;

        for (const r of regs.slice(0, 15)) {
          const celulaDiag = formatarCelulaDiagnosticoHtml(r, {
            sistema: 'DSI',
            grupo: u.grupo,
            statusCode: st.code,
            statusLabel: st.label,
          });
          itens.push(`
            <tr>
              <td>
                <span class="badge badge-${st.code.toLowerCase()}">${escaparHtml(st.label)}</span>
                ${formatarDeltaHtml(r, comparacao)}
              </td>
              <td><code>${escaparHtml(r.codigo)}</code></td>
              <td>${escaparHtml(r.data)}</td>
              <td>${escaparHtml(r.integracao)}</td>
              <td class="detalhes">${escaparHtml(r.detalhes || r.raw)}</td>
              <td class="diag-cell">${celulaDiag}</td>
            </tr>
          `);
        }
      }
      if (itens.length === 0) return '';

      const notaOcultos =
        ocultos > 0
          ? `<p class="muted" style="margin:4px 0 0 0;">+ ${ocultos} registro(s) adicional(is) omitido(s) nesta tabela (limite visual de 15 por status).</p>`
          : '';

      return `
        <div class="unit-block">
          <h3>${escaparHtml(u.nome)} <span class="muted">(${escaparHtml(u.grupo)})</span></h3>
          <table class="detail-table">
            <thead>
              <tr>
                <th style="width:140px">Status</th>
                <th style="width:80px">Código</th>
                <th style="width:110px">Data</th>
                <th style="width:85px">Integração</th>
                <th>Interface / Chave / Observação</th>
                <th style="width:240px">Diagnóstico &amp; Ação (Doc. Dealernet)</th>
              </tr>
            </thead>
            <tbody>
              ${itens.join('')}
            </tbody>
          </table>
          ${notaOcultos}
        </div>
      `;
    })
    .join('');

  const renaveComProblema = resultadosRenave.filter((u) => u.ocorrencias.length > 0);
  const renaveComLimite = resultadosRenave.filter((u) => u.limitesAtingidos?.length > 0);

  const alertaLimiteRenave =
    renaveComLimite.length > 0
      ? `<p class="info-box">Limite de paginação do Renave atingido em: ${renaveComLimite
          .map((u) => `<strong>${escaparHtml(u.nome)}</strong> (${escaparHtml(u.limitesAtingidos.join(', '))})`)
          .join('; ')}.</p>`
      : '';

  const linhasRenave =
    renaveComProblema.length === 0
      ? `<p class="ok-box">Todas as ${resultadosRenave.length} unidades consultadas no Renave estão sem erros ou pendências no período.</p>`
      : `
        <table class="detail-table">
          <thead>
            <tr>
              <th style="width:155px">Unidade</th>
              <th style="width:140px">Status</th>
              <th style="width:80px">Código</th>
              <th style="width:110px">Data</th>
              <th>Interface / Chave / Chassi / Observação</th>
              <th style="width:240px">Diagnóstico &amp; Ação (Doc. Dealernet)</th>
            </tr>
          </thead>
          <tbody>
            ${renaveComProblema
              .map((u) =>
                u.ocorrencias
                  .map(
                    (oc) => `
                  <tr>
                    <td><strong>${escaparHtml(u.nome)}</strong></td>
                    <td>
                      <span class="badge badge-${(oc.statusCode || 'err').toLowerCase()}">${escaparHtml(oc.statusLabel)}</span>
                      ${formatarDeltaHtml(oc, comparacao)}
                    </td>
                    <td><code>${escaparHtml(oc.codigo)}</code></td>
                    <td>${escaparHtml(oc.data)}</td>
                    <td class="detalhes">${escaparHtml(oc.detalhes || oc.raw)}</td>
                    <td class="diag-cell">${formatarCelulaDiagnosticoHtml(oc, {
                      sistema: 'RNV',
                      statusCode: oc.statusCode,
                      statusLabel: oc.statusLabel,
                    })}</td>
                  </tr>
                `
                  )
                  .join('')
              )
              .join('')}
          </tbody>
        </table>
      `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório de Integrações DealerNet</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      font-size: 11px;
      line-height: 1.4;
      margin: 0;
      padding: 0;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header h1 {
      margin: 0;
      font-size: 18px;
      color: #0f172a;
    }
    .header .meta {
      text-align: right;
      font-size: 10px;
      color: #475569;
    }
    h2 {
      font-size: 13px;
      background: #0f172a;
      color: #ffffff;
      padding: 6px 10px;
      border-radius: 4px;
      margin: 14px 0 8px 0;
    }
    h3 {
      font-size: 12px;
      margin: 10px 0 4px 0;
      color: #1e293b;
    }
    .muted {
      color: #64748b;
      font-weight: normal;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 7px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #334155;
    }
    td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    td.center { text-align: center; }
    td.detalhes {
      font-size: 10px;
      word-break: break-word;
    }
    .cell-err { background: #fef2f2; color: #b91c1c; }
    .cell-out { background: #fff7ed; color: #c2410c; }
    .cell-inc { background: #fefce8; color: #a16207; }
    .cell-pen { background: #eff6ff; color: #1d4ed8; }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      margin-right: 2px;
    }
    .badge-ok  { background: #dcfce7; color: #15803d; }
    .badge-warn { background: #fee2e2; color: #b91c1c; }
    .badge-err { background: #fee2e2; color: #b91c1c; }
    .badge-out { background: #ffedd5; color: #c2410c; }
    .badge-inc { background: #fef9c3; color: #854d0e; }
    .badge-pen { background: #dbeafe; color: #1e40af; }
    .badge-nova { background: #ede9fe; color: #6d28d9; border: 1px solid #c4b5fd; }
    .badge-persistente { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
    .badge-diag-bloqueio { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .badge-diag-cadastro { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .badge-diag-infra { background: #fae8ff; color: #86198f; border: 1px solid #e879f9; }
    .badge-diag-reenviar { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .badge-diag-aguardar { background: #e0f2fe; color: #075985; border: 1px solid #7dd3fc; }
    .badge-ordem { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .badge-count { background: #0f172a; color: #ffffff; }
    .diag-cell { font-size: 9.5px; line-height: 1.35; }
    .playbook-card {
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      margin-bottom: 8px;
      background: #ffffff;
      page-break-inside: avoid;
    }
    .playbook-header {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 6px 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .playbook-body {
      padding: 6px 10px;
      font-size: 10px;
      line-height: 1.45;
    }
    .playbook-body > div {
      margin-bottom: 2px;
    }
    .unit-block {
      page-break-inside: avoid;
      margin-bottom: 10px;
    }
    .ok-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      padding: 8px 12px;
      border-radius: 4px;
    }
    .info-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #334155;
      padding: 7px 10px;
      border-radius: 4px;
      margin-bottom: 10px;
      font-size: 10px;
    }
    .diff-summary {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 7px 10px;
      border-radius: 4px;
      margin-bottom: 10px;
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .fail-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 10px;
    }
    .fail-box ul {
      margin: 4px 0 0 18px;
      padding: 0;
    }
    .ref-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 10px;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Relatório de Verificação de Integrações — DealerNet</h1>
      <div style="font-size:10.5px; color:#475569;">Escopo: DSI (NDI Nissan &amp; DSI Toyota) e Renave (${resultadosRenave.length} Unidade(s) Verificada(s))</div>
    </div>
    <div class="meta">
      <div><strong>Período filtrado:</strong> ${escaparHtml(periodo.dataInicio)} até ${escaparHtml(periodo.dataFim)}</div>
      <div><strong>Gerado em:</strong> ${escaparHtml(periodo.geradoEm || '')}</div>
    </div>
  </div>

  ${renderizarFalhasHtml(falhasColeta)}
  ${renderizarBlocoComparacaoHtml(comparacao)}

  <h2>1. Resumo Geral — DSI (Nissan &amp; Toyota)</h2>
  <table>
    <thead>
      <tr>
        <th>Unidade</th>
        <th>Integração</th>
        <th style="text-align:right">Erro</th>
        <th style="text-align:right">Outros Erros</th>
        <th style="text-align:right">Com Inconsistências</th>
        <th style="text-align:right">Pendente</th>
        <th style="text-align:right">Ficha Gama JADE (Hoje) Ignoradas</th>
        <th style="text-align:center">Situação</th>
      </tr>
    </thead>
    <tbody>
      ${linhasResumoDSI}
    </tbody>
  </table>

  <h2>2. Ocorrências no Renave (${resultadosRenave.length} Unidades Verificadas)</h2>
  ${alertaLimiteRenave}
  ${linhasRenave}

  <h2>3. Detalhamento de Ocorrências — DSI (Por Unidade)</h2>
  ${blocosDetalhesDSI || '<p class="ok-box">Nenhuma ocorrência pendente ou com erro nas unidades DSI verificadas.</p>'}

  ${renderizarPlaybookHtml(playbook)}

  ${renderizarResolvidasHtml(comparacao)}

  <div class="ref-box">
    <strong>Referência do Chamado — Ordem de Reenvio DSI Toyota:</strong><br/>
    ${ORDEM_REENVIO_TOYOTA.map((p) => escaparHtml(p)).join(' &rarr; ')}
  </div>
</body>
</html>`;
}

/**
 * Gera a versão Markdown do relatório.
 */
export function gerarRelatorioMarkdown(periodo, resultadosDSI, resultadosRenave, opcoes = {}) {
  const { comparacao = null, falhasColeta = [] } = opcoes;
  const playbook = gerarPlaybookResumo(resultadosDSI, resultadosRenave);
  const linhas = [];

  linhas.push(`# Relatório de Verificação de Integrações DealerNet`);
  linhas.push(`- **Período:** \`${periodo.dataInicio}\` até \`${periodo.dataFim}\``);
  linhas.push(`- **Gerado em:** ${periodo.geradoEm || '-'}`);
  linhas.push(`- **Modo:** Somente leitura (nenhum reenvio executado automaticamente)`);

  if (comparacao?.temComparacao) {
    linhas.push(
      `- **Comparação com ${comparacao.geradoEmAnterior}:** ${comparacao.totalNovas} nova(s) | ${comparacao.totalPersistentes} persistente(s) | ${comparacao.totalResolvidas} resolvida(s)`
    );
  }
  linhas.push('');

  if (falhasColeta.length > 0) {
    linhas.push(`## Unidades Não Verificadas (Falha na Coleta)\n`);
    for (const f of falhasColeta) {
      linhas.push(`- **[${f.sistema}] ${f.unidadeNome}:** ${f.erro}`);
    }
    linhas.push('');
  }

  linhas.push(`## 1. DSI / NDI (Nissan e Toyota)\n`);
  linhas.push(
    `| Unidade | Grupo | Erro | Outros Erros | Com Inconsistências | Pendente | Ficha Gama JADE (Hoje) Desprezadas |`
  );
  linhas.push(`|---|---|---:|---:|---:|---:|---:|`);

  for (const u of resultadosDSI) {
    const { porCodigo } = contarPorStatusDSI(u, STATUS_ALVO);
    linhas.push(
      `| **${u.nome}** | ${u.grupo} | ${porCodigo.ERR.texto} | ${porCodigo.OUT.texto} | ${porCodigo.INC.texto} | ${porCodigo.PEN.texto} | ${u.desprezadosFichaGamaHoje || 0} |`
    );
  }

  linhas.push(`\n### Detalhamento DSI por Unidade\n`);
  for (const u of resultadosDSI) {
    const todos = STATUS_ALVO.flatMap((st) => u.porStatus[st.code]?.registros || []);
    if (todos.length === 0) {
      linhas.push(`#### ${u.nome} (${u.grupo}): Sem ocorrências pendentes/erros.\n`);
      continue;
    }
    linhas.push(`#### ${u.nome} (${u.grupo})`);
    for (const st of STATUS_ALVO) {
      const bloco = u.porStatus[st.code];
      const lista = bloco?.registros || [];
      if (lista.length > 0) {
        linhas.push(
          `- **${st.label} (${lista.length}${bloco.atingiuLimitePaginas ? '+' : ''}):**`
        );
        for (const item of lista.slice(0, 15)) {
          const tag = formatarDeltaTexto(item, comparacao);
          const diag = obterDiagnostico(item, {
            sistema: 'DSI',
            grupo: u.grupo,
            statusCode: st.code,
            statusLabel: st.label,
          });
          linhas.push(`  - ${tag}\`${item.raw.replace(/\t+/g, ' | ')}\` — _${diag.acaoLabel}_`);
        }
      }
    }
    linhas.push('');
  }

  linhas.push(`## 2. Renave (${resultadosRenave.length} Unidades Verificadas)\n`);
  const renaveComProblema = resultadosRenave.filter((u) => u.ocorrencias.length > 0);
  if (renaveComProblema.length === 0) {
    linhas.push(
      `Todas as ${resultadosRenave.length} unidades verificadas estão sem erros ou pendências no período.`
    );
  } else {
    for (const u of renaveComProblema) {
      const avisoLimite = u.limitesAtingidos?.length
        ? ` *(limite de páginas atingido em: ${u.limitesAtingidos.join(', ')})*`
        : '';
      linhas.push(`### ${u.nome}${avisoLimite}`);
      for (const oc of u.ocorrencias) {
        const tag = formatarDeltaTexto(oc, comparacao);
        const diag = obterDiagnostico(oc, {
          sistema: 'RNV',
          statusCode: oc.statusCode,
          statusLabel: oc.statusLabel,
        });
        linhas.push(
          `- ${tag}**[${oc.statusLabel}]** \`${oc.raw.replace(/\t+/g, ' | ')}\` — _${diag.acaoLabel}_`
        );
      }
      linhas.push('');
    }
  }

  if (playbook.length > 0) {
    linhas.push(`\n## 3. Plano de Ação e Resolução Consolidado (Doc. Dealernet)\n`);
    for (const p of playbook) {
      const ordem = p.ordemPrecedencia ? ` | Ordem: ${p.ordemPrecedencia}` : '';
      const amostras = p.chavesAmostra.length ? ` | Chaves: \`${p.chavesAmostra.join('`, `')}\`` : '';
      linhas.push(`- **[${p.acaoLabel}${ordem}] ${p.titulo}** (${p.totalOcorrencias} ocorrência(s))`);
      linhas.push(`  - **Unidades:** ${p.unidades.join(', ')}${amostras}`);
      linhas.push(`  - **Causa:** ${p.causa}`);
      linhas.push(`  - **Como resolver:** ${p.passosResolucao}`);
    }
  }

  if (comparacao?.temComparacao && comparacao.resolvidas?.length > 0) {
    linhas.push(`\n## 4. Ocorrências Resolvidas Desde a Última Execução\n`);
    for (const r of comparacao.resolvidas) {
      linhas.push(
        `- **[${r.sistema} | ${r.unidadeNome} | ${r.statusLabel}]** \`${(r.raw || r.codigo).replace(/\t+/g, ' | ')}\``
      );
    }
  }

  linhas.push(`\n## Referência: Ordem de Reenvio DSI Toyota`);
  for (const passo of ORDEM_REENVIO_TOYOTA) {
    linhas.push(`- ${passo}`);
  }

  return linhas.join('\n');
}

/**
 * Gera texto compacto pronto para copiar e colar no chamado ou corpo de e-mail em texto puro.
 */
export function gerarResumoChamadoTxt(periodo, resultadosDSI, resultadosRenave, opcoes = {}) {
  const { comparacao = null, falhasColeta = [] } = opcoes;
  const playbook = gerarPlaybookResumo(resultadosDSI, resultadosRenave);
  const l = [];

  l.push(`VERIFICAÇÃO DE INTEGRAÇÕES DEALERNET (${periodo.dataInicio} a ${periodo.dataFim})`);
  l.push(`========================================================================`);

  if (comparacao?.temComparacao) {
    l.push(
      `RESUMO vs ${comparacao.geradoEmAnterior}: ${comparacao.totalNovas} nova(s) | ${comparacao.totalPersistentes} persistente(s) | ${comparacao.totalResolvidas} resolvida(s)`
    );
  }

  if (falhasColeta.length > 0) {
    l.push(`\nALERTA — UNIDADES NÃO VERIFICADAS (${falhasColeta.length}):`);
    for (const f of falhasColeta) {
      l.push(`- [${f.sistema}] ${f.unidadeNome}: ${f.erro}`);
    }
  }

  l.push(`\n1) NDI NISSAN / DSI TOYOTA:`);
  for (const u of resultadosDSI) {
    const { porCodigo, total } = contarPorStatusDSI(u, STATUS_ALVO);
    if (total === 0) {
      l.push(`- ${u.nome}: OK (0 erros / 0 pendências)`);
    } else {
      l.push(
        `- ${u.nome}: Erro=${porCodigo.ERR.texto} | Outros Erros=${porCodigo.OUT.texto} | Com Inconsistências=${porCodigo.INC.texto} | Pendente=${porCodigo.PEN.texto}`
      );
      for (const st of STATUS_ALVO) {
        for (const reg of (u.porStatus[st.code]?.registros || []).slice(0, 5)) {
          const tag = formatarDeltaTexto(reg, comparacao);
          l.push(`    * ${tag}[${st.label}] ${reg.raw.replace(/\t+/g, ' | ')}`);
        }
      }
    }
  }

  l.push(`\n2) RENAVE (${resultadosRenave.length} UNIDADES VERIFICADAS):`);
  const renaveComProblema = resultadosRenave.filter((u) => u.ocorrencias.length > 0);
  if (renaveComProblema.length === 0) {
    l.push(`- Todas as unidades OK (sem erros ou pendências).`);
  } else {
    for (const u of renaveComProblema) {
      const sufixoLimite = u.limitesAtingidos?.length
        ? ` [limite atingido em: ${u.limitesAtingidos.join(', ')}]`
        : '';
      l.push(`- ${u.nome}: ${u.ocorrencias.length} ocorrência(s)${sufixoLimite}:`);
      for (const oc of u.ocorrencias) {
        const tag = formatarDeltaTexto(oc, comparacao);
        l.push(`    * ${tag}[${oc.statusLabel}] ${oc.raw.replace(/\t+/g, ' | ')}`);
      }
    }
  }

  if (playbook.length > 0) {
    l.push(`\n3) PLANO DE AÇÃO E RESOLUÇÃO (DOC. DEALERNET — ${playbook.length} TIPO(S)):`);
    for (const p of playbook) {
      const amostras = p.chavesAmostra.length ? ` | Chaves: ${p.chavesAmostra.join(', ')}` : '';
      l.push(
        `- [${p.acaoLabel}] ${p.titulo} (${p.totalOcorrencias}x em ${p.unidades.join(', ')}${amostras})`
      );
      l.push(`    -> ${p.passosResolucao}`);
    }
  }

  if (comparacao?.temComparacao && comparacao.resolvidas?.length > 0) {
    l.push(`\n4) RESOLVIDAS DESDE A ÚLTIMA VERIFICAÇÃO (${comparacao.resolvidas.length}):`);
    for (const r of comparacao.resolvidas.slice(0, 15)) {
      l.push(`- [${r.sistema} | ${r.unidadeNome} | ${r.statusLabel}] ${r.codigo} (${r.data})`);
    }
  }

  return l.join('\n');
}

/**
 * Gera o arquivo PDF a partir do HTML estilizado usando o Chromium do Playwright.
 */
export async function salvarHtmlComoPdf(
  htmlContent,
  caminhoPdf,
  browserExistente = null,
  headless = true
) {
  let browserPdf = browserExistente;
  let fecharBrowser = false;

  if (!headless || !browserPdf) {
    browserPdf = await chromium.launch({ headless: true });
    fecharBrowser = true;
  }

  try {
    const pagePdf = await browserPdf.newPage();
    await pagePdf.setContent(htmlContent, { waitUntil: 'load' });
    await pagePdf.pdf({
      path: caminhoPdf,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="width:100%; font-size:8px; font-family:sans-serif; color:#64748b; padding:0 12mm; display:flex; justify-content:space-between;">
          <span>DealerNet — Relatório Automático de Integrações (Somente Leitura)</span>
          <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>
      `,
    });
    await pagePdf.close();
  } finally {
    if (fecharBrowser && browserPdf) {
      await browserPdf.close();
    }
  }
}
