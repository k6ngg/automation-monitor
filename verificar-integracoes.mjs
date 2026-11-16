/**
 * ============================================================================
 * VERIFICADOR SOMENTE-LEITURA DE INTEGRAÇÕES DEALERNET (DSI/NDI & RENAVE)
 * ============================================================================
 * SEGURANÇA (READ-ONLY):
 * Este script realiza EXCLUSIVAMENTE consultas:
 *   - Login no portal DealerNet
 *   - Abertura do menu Integração > Cadastro > Monitor
 *   - Seleção de filtros (Sistema, Empresa, Data, Status)
 *   - Clique no botão de pesquisa (#IMGATUALIZAR) e paginação (Próximo)
 *   - Extração do texto da tabela para gerar relatórios locais em ./relatorios/
 *     nos formatos PDF (.pdf), Markdown (.md) e Texto para chamado (.txt).
 *
 * NENHUM botão de ação nas linhas (Reenvio, Alterar, Excluir, etc.) é clicado.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import {
  STATUS_ALVO,
  UNIDADES_DSI,
  UNIDADES_RENAVE,
  ORDEM_REENVIO_TOYOTA,
} from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const DEALERNET_URL =
  process.env.DEALERNET_URL ||
  'https://dealernet.grupoitadil.com.br/Portal/default.html';
const DEALERNET_USER = process.env.DEALERNET_USER;
const DEALERNET_PASS = process.env.DEALERNET_PASS;
const HEADLESS = process.env.HEADLESS !== 'false';
const MAX_PAGES = Number(process.env.MAX_PAGES_PER_STATUS || 5);
const DESPREZAR_FICHA_GAMA_DO_DIA =
  process.env.DESPREZAR_FICHA_GAMA_DO_DIA !== 'false';

if (!DEALERNET_USER || !DEALERNET_PASS) {
  console.error(
    'Erro: defina DEALERNET_USER e DEALERNET_PASS no arquivo .env antes de executar.'
  );
  process.exit(1);
}

/**
 * Calcula automaticamente o período: 1º dia do mês atual (00:00) até hoje (23:59)
 */
function obterPeriodoMesAtual() {
  const agora = new Date();
  const dia = String(agora.getDate()).padStart(2, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const ano = agora.getFullYear();
  const hora = String(agora.getHours()).padStart(2, '0');
  const min = String(agora.getMinutes()).padStart(2, '0');

  return {
    dataHojePrefixo: `${dia}/${mes}/${ano}`,
    dataInicio: process.env.DATA_INICIO || `01/${mes}/${ano} 00:00`,
    dataFim: process.env.DATA_FIM || `${dia}/${mes}/${ano} 23:59`,
    geradoEm: `${dia}/${mes}/${ano} às ${hora}:${min}`,
    timestampArquivo: `${ano}-${mes}-${dia}_${hora}-${min}`,
  };
}

function escaparHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Realiza login e abre a tela Integração > Cadastro > Monitor
 */
async function autenticarEAbrirMonitor(page) {
  console.log('-> Acessando portal DealerNet...');
  await page.goto(DEALERNET_URL, { waitUntil: 'load', timeout: 60000 });

  const userField = page.locator(
    '#vUSUARIO_IDENTIFICADORALTERNATIVO, input[name*="USUARIO_IDENTIFICADOR"]'
  );
  const btnIntegracao = page.getByRole('button', { name: 'Integração' });

  // Aguarda o redirecionamento estabilizar na tela de login ou no portal já autenticado
  await userField.first().or(btnIntegracao).waitFor({ state: 'visible', timeout: 30000 });

  if (await userField.first().isVisible()) {
    console.log(`-> Realizando login com usuário ${DEALERNET_USER}...`);
    await userField.first().fill(DEALERNET_USER);
    await page
      .locator('#vUSUARIOSENHA_SENHA, input[name*="SENHA"]')
      .first()
      .fill(DEALERNET_PASS);
    await page
      .locator('#IMAGE3')
      .click();
    await btnIntegracao.waitFor({ state: 'visible', timeout: 30000 });
  }

  console.log('-> Abrindo menu Integração > Cadastro > Monitor...');
  await btnIntegracao.waitFor({ state: 'visible', timeout: 15000 });
  await btnIntegracao.click();
  await page.waitForTimeout(500);

  const itemCadastro = page
    .locator('a, li, span')
    .filter({ hasText: /^Cadastro$/i })
    .first();
  await itemCadastro.hover();
  await page.waitForTimeout(500);

  const itemMonitor = page
    .locator('a, li, span')
    .filter({ hasText: /^Monitor$/i })
    .first();
  await itemMonitor.click();

  const frame = page.frameLocator('iframe[src*="wwmonitorsistema.aspx"]');
  await frame
    .locator('#vMONITOR_SISTEMA')
    .waitFor({ state: 'visible', timeout: 20000 });
  console.log('-> Tela Monitor carregada com sucesso.');
  return frame;
}

/**
 * Seleciona opção em dropdown GeneXus garantindo disparo de onchange/onblur
 */
async function selecionarDropdownGX(frame, selector, value) {
  const el = frame.locator(selector);
  await el.selectOption(value);
  await el.dispatchEvent('change');
  await el.dispatchEvent('blur');
}

/**
 * Aguarda o overlay de carregamento AJAX do GeneXus desaparecer
 */
async function aguardarLoadingGX(frame, timeout = 30000) {
  await frame
    .locator('#gx_ajax_notification')
    .waitFor({ state: 'hidden', timeout })
    .catch(() => null);
}

/**
 * Executa um clique que dispara POST AJAX do GeneXus no iframe e aguarda a resposta real
 */
async function clicarEAguardarAjax(page, frame, locator, timeout = 30000) {
  await aguardarLoadingGX(frame, timeout);

  const responsePromise = page
    .waitForResponse(
      (resp) =>
        resp.url().includes('wwmonitorsistema.aspx') &&
        resp.request().method() === 'POST',
      { timeout }
    )
    .catch(() => null);

  await locator.click({ timeout });
  await responsePromise;
  await aguardarLoadingGX(frame, timeout);
  await page.waitForTimeout(300);
}

/**
 * Extrai as linhas visíveis na tabela do Monitor
 */
async function extrairLinhasDaPagina(frame) {
  const bodyText = await frame.locator('body').innerText();
  const idx = bodyText.indexOf('Código\tIntegração\tData');
  if (idx === -1) return [];

  const tablePart = bodyText.slice(idx);
  const rawLines = tablePart
    .split('\n')
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
 * Executa a consulta para uma combinação de Empresa + Status e percorre a paginação (somente leitura)
 */
async function consultarStatus(page, frame, statusObj, maxPages = MAX_PAGES) {
  const { code: statusCode, label: statusLabel } = statusObj;

  await selecionarDropdownGX(frame, '#vMONITOR_STATUS', statusCode);
  await page.waitForTimeout(250);

  // Garante que o dropdown manteve o valor antes de disparar a pesquisa
  const statusAtual = await frame.locator('#vMONITOR_STATUS').inputValue();
  if (statusAtual !== statusCode) {
    await selecionarDropdownGX(frame, '#vMONITOR_STATUS', statusCode);
    await page.waitForTimeout(250);
  }

  await clicarEAguardarAjax(page, frame, frame.locator('#IMGATUALIZAR'));

  const todasLinhas = [];
  let paginaAtual = 1;
  let temMaisPaginas = false;

  while (paginaAtual <= maxPages) {
    const linhas = await extrairLinhasDaPagina(frame);
    // Garante que só contabiliza registros cujo Status na tabela corresponde ao filtro pedido
    const linhasDoStatus = linhas.filter((l) =>
      l.cols.some((c) => c.toLowerCase() === statusLabel.toLowerCase())
    );

    for (const l of linhasDoStatus) {
      if (!todasLinhas.some((existente) => existente.raw === l.raw)) {
        todasLinhas.push(l);
      }
    }

    const nextBtn = frame.locator('span.PagingButtonsNext[onclick]');
    temMaisPaginas = (await nextBtn.count()) > 0;

    if (!temMaisPaginas || linhas.length === 0 || paginaAtual >= maxPages) {
      break;
    }

    try {
      await clicarEAguardarAjax(page, frame, nextBtn.first(), 15000);
    } catch {
      // Se o botão de próxima página foi removido durante a atualização, encerra a paginação com segurança
      break;
    }
    paginaAtual++;
  }

  return {
    registros: todasLinhas,
    atingiuLimitePaginas: temMaisPaginas && paginaAtual >= maxPages,
  };
}

/**
 * Verifica se a sessão expirou e refaz login/abertura do Monitor se necessário
 */
async function garantirSessaoAtiva(page, frame) {
  const url = page.url();
  const countSistema = await frame.locator('#vMONITOR_SISTEMA').count();
  if (url.includes('Login') || url.includes('login') || countSistema === 0) {
    console.log('   [!] Sessão expirada detectada. Reconectando...');
    return await autenticarEAbrirMonitor(page);
  }
  return frame;
}

/**
 * Gera o arquivo PDF a partir do HTML estilizado usando o Chromium do Playwright
 */
async function salvarHtmlComoPdf(htmlContent, caminhoPdf, browserExistente) {
  let browserPdf = browserExistente;
  let fecharBrowser = false;

  // page.pdf() do Chromium exige modo headless
  if (!HEADLESS || !browserPdf) {
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

async function main() {
  const periodo = obterPeriodoMesAtual();
  console.log('====================================================================');
  console.log(' VERIFICAÇÃO DE INTEGRAÇÕES DEALERNET (MODO SOMENTE-LEITURA)');
  console.log(` Período: ${periodo.dataInicio} até ${periodo.dataFim}`);
  console.log('====================================================================');

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const resultadosDSI = [];
  const resultadosRenave = [];

  try {
    let frame = await autenticarEAbrirMonitor(page);

    // ========================================================================
    // PARTE 1: DSI (NDI Nissan + DSI Toyota)
    // ========================================================================
    console.log('\n[1/2] Consultando Sistema = DSI...');
    await selecionarDropdownGX(frame, '#vMONITOR_SISTEMA', 'DSI');
    await page.waitForTimeout(2000);

    await frame.locator('#vMONITOR_DATA').fill(periodo.dataInicio);
    await frame.locator('#vMONITOR_DATA_TO').fill(periodo.dataFim);

    for (const unidade of UNIDADES_DSI) {
      frame = await garantirSessaoAtiva(page, frame);
      const sisAtual = await frame.locator('#vMONITOR_SISTEMA').inputValue();
      if (sisAtual !== 'DSI') {
        await selecionarDropdownGX(frame, '#vMONITOR_SISTEMA', 'DSI');
        await page.waitForTimeout(2000);
        await frame.locator('#vMONITOR_DATA').fill(periodo.dataInicio);
        await frame.locator('#vMONITOR_DATA_TO').fill(periodo.dataFim);
      }

      console.log(`  -> Unidade DSI: ${unidade.nome} (${unidade.grupo})`);
      await selecionarDropdownGX(frame, '#vMONITOR_EMPRESACOD', unidade.code);
      await page.waitForTimeout(300);

      const porStatus = {};
      let desprezadosFichaGamaHoje = 0;

      for (const st of STATUS_ALVO) {
        const res = await consultarStatus(page, frame, st, MAX_PAGES);

        const filtrados = res.registros.filter((reg) => {
          const ehFichaGama = reg.raw.includes('Ficha Gama');
          const ehDeHoje = reg.raw.includes(periodo.dataHojePrefixo);
          if (DESPREZAR_FICHA_GAMA_DO_DIA && ehFichaGama && ehDeHoje) {
            desprezadosFichaGamaHoje++;
            return false;
          }
          return true;
        });

        porStatus[st.code] = {
          label: st.label,
          registros: filtrados,
          atingiuLimitePaginas: res.atingiuLimitePaginas,
        };
      }

      resultadosDSI.push({
        ...unidade,
        porStatus,
        desprezadosFichaGamaHoje,
      });
    }

    // ========================================================================
    // PARTE 2: RENAVE (Todas as unidades)
    // ========================================================================
    console.log('\n[2/2] Consultando Sistema = Renave (RNV)...');
    frame = await garantirSessaoAtiva(page, frame);
    await selecionarDropdownGX(frame, '#vMONITOR_SISTEMA', 'RNV');
    await page.waitForTimeout(2000);

    await frame.locator('#vMONITOR_DATA').fill(periodo.dataInicio);
    await frame.locator('#vMONITOR_DATA_TO').fill(periodo.dataFim);

    for (const unidade of UNIDADES_RENAVE) {
      frame = await garantirSessaoAtiva(page, frame);
      const sisAtual = await frame.locator('#vMONITOR_SISTEMA').inputValue();
      if (sisAtual !== 'RNV') {
        await selecionarDropdownGX(frame, '#vMONITOR_SISTEMA', 'RNV');
        await page.waitForTimeout(2000);
        await frame.locator('#vMONITOR_DATA').fill(periodo.dataInicio);
        await frame.locator('#vMONITOR_DATA_TO').fill(periodo.dataFim);
      }

      console.log(`  -> Unidade Renave: ${unidade.nome}`);
      await selecionarDropdownGX(frame, '#vMONITOR_EMPRESACOD', unidade.code);
      await page.waitForTimeout(250);

      const ocorrencias = [];
      for (const st of STATUS_ALVO) {
        const res = await consultarStatus(page, frame, st, 2);
        for (const r of res.registros) {
          ocorrencias.push({ statusCode: st.code, statusLabel: st.label, ...r });
        }
      }

      resultadosRenave.push({
        ...unidade,
        ocorrencias,
      });
    }

    // ========================================================================
    // GERAÇÃO DOS RELATÓRIOS (.pdf, .md e .txt)
    // ========================================================================
    const pastaRelatorios = path.join(__dirname, 'relatorios');
    fs.mkdirSync(pastaRelatorios, { recursive: true });

    const caminhoPdf = path.join(
      pastaRelatorios,
      `relatorio-${periodo.timestampArquivo}.pdf`
    );
    const caminhoMd = path.join(
      pastaRelatorios,
      `relatorio-${periodo.timestampArquivo}.md`
    );
    const caminhoTxt = path.join(
      pastaRelatorios,
      `chamado-${periodo.timestampArquivo}.txt`
    );

    const conteudoHtml = gerarRelatorioHtml(periodo, resultadosDSI, resultadosRenave);
    const conteudoMd = gerarRelatorioMarkdown(periodo, resultadosDSI, resultadosRenave);
    const conteudoTxt = gerarResumoChamadoTxt(periodo, resultadosDSI, resultadosRenave);

    await salvarHtmlComoPdf(conteudoHtml, caminhoPdf, browser);
    fs.writeFileSync(caminhoMd, conteudoMd, 'utf8');
    fs.writeFileSync(caminhoTxt, conteudoTxt, 'utf8');

    console.log('\n====================================================================');
    console.log(' VERIFICAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log(` Relatório em PDF:              ${caminhoPdf}`);
    console.log(` Relatório em Markdown:         ${caminhoMd}`);
    console.log(` Texto pronto para o chamado:   ${caminhoTxt}`);
    console.log('====================================================================\n');
  } finally {
    await browser.close();
  }
}

export function gerarRelatorioHtml(periodo, resultadosDSI, resultadosRenave) {
  const linhasResumoDSI = resultadosDSI
    .map((u) => {
      const cErr = u.porStatus.ERR.registros.length + (u.porStatus.ERR.atingiuLimitePaginas ? '+' : '');
      const cOut = u.porStatus.OUT.registros.length + (u.porStatus.OUT.atingiuLimitePaginas ? '+' : '');
      const cInc = u.porStatus.INC.registros.length + (u.porStatus.INC.atingiuLimitePaginas ? '+' : '');
      const cPen = u.porStatus.PEN.registros.length + (u.porStatus.PEN.atingiuLimitePaginas ? '+' : '');
      const totalNum =
        u.porStatus.ERR.registros.length +
        u.porStatus.OUT.registros.length +
        u.porStatus.INC.registros.length +
        u.porStatus.PEN.registros.length;

      const statusGeral =
        totalNum === 0
          ? `<span class="badge badge-ok">OK</span>`
          : `<span class="badge badge-warn">Verificar (${totalNum})</span>`;

      return `
        <tr>
          <td><strong>${escaparHtml(u.nome)}</strong></td>
          <td>${escaparHtml(u.grupo)}</td>
          <td class="num ${u.porStatus.ERR.registros.length > 0 ? 'cell-err' : ''}">${cErr}</td>
          <td class="num ${u.porStatus.OUT.registros.length > 0 ? 'cell-out' : ''}">${cOut}</td>
          <td class="num ${u.porStatus.INC.registros.length > 0 ? 'cell-inc' : ''}">${cInc}</td>
          <td class="num ${u.porStatus.PEN.registros.length > 0 ? 'cell-pen' : ''}">${cPen}</td>
          <td class="num">${u.desprezadosFichaGamaHoje || 0}</td>
          <td class="center">${statusGeral}</td>
        </tr>
      `;
    })
    .join('');

  const blocosDetalhesDSI = resultadosDSI
    .map((u) => {
      const itens = [];
      for (const st of STATUS_ALVO) {
        const regs = u.porStatus[st.code]?.registros || [];
        for (const r of regs.slice(0, 15)) {
          itens.push(`
            <tr>
              <td><span class="badge badge-${st.code.toLowerCase()}">${escaparHtml(st.label)}</span></td>
              <td><code>${escaparHtml(r.codigo)}</code></td>
              <td>${escaparHtml(r.data)}</td>
              <td>${escaparHtml(r.integracao)}</td>
              <td class="detalhes">${escaparHtml(r.detalhes || r.raw)}</td>
            </tr>
          `);
        }
      }
      if (itens.length === 0) return '';
      return `
        <div class="unit-block">
          <h3>${escaparHtml(u.nome)} <span class="muted">(${escaparHtml(u.grupo)})</span></h3>
          <table class="detail-table">
            <thead>
              <tr>
                <th style="width:130px">Status</th>
                <th style="width:90px">Código</th>
                <th style="width:125px">Data</th>
                <th style="width:100px">Integração</th>
                <th>Interface / Chave / Observação</th>
              </tr>
            </thead>
            <tbody>
              ${itens.join('')}
            </tbody>
          </table>
        </div>
      `;
    })
    .join('');

  const renaveComProblema = resultadosRenave.filter((u) => u.ocorrencias.length > 0);
  const linhasRenave =
    renaveComProblema.length === 0
      ? `<p class="ok-box">Todas as ${resultadosRenave.length} unidades consultadas no Renave estão sem erros ou pendências no período.</p>`
      : `
        <table class="detail-table">
          <thead>
            <tr>
              <th style="width:180px">Unidade</th>
              <th style="width:120px">Status</th>
              <th style="width:90px">Código</th>
              <th style="width:125px">Data</th>
              <th>Interface / Chave / Chassi / Observação</th>
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
                    <td><span class="badge badge-${(oc.statusCode || 'err').toLowerCase()}">${escaparHtml(oc.statusLabel)}</span></td>
                    <td><code>${escaparHtml(oc.codigo)}</code></td>
                    <td>${escaparHtml(oc.data)}</td>
                    <td class="detalhes">${escaparHtml(oc.detalhes || oc.raw)}</td>
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
      margin-bottom: 14px;
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
      margin: 16px 0 8px 0;
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
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-ok  { background: #dcfce7; color: #15803d; }
    .badge-warn { background: #fee2e2; color: #b91c1c; }
    .badge-err { background: #fee2e2; color: #b91c1c; }
    .badge-out { background: #ffedd5; color: #c2410c; }
    .badge-inc { background: #fef9c3; color: #854d0e; }
    .badge-pen { background: #dbeafe; color: #1e40af; }
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
      <div style="font-size:10.5px; color:#475569;">Escopo: DSI (NDI Nissan &amp; DSI Toyota) e Renave (Todas as Unidades)</div>
    </div>
    <div class="meta">
      <div><strong>Período filtrado:</strong> ${escaparHtml(periodo.dataInicio)} até ${escaparHtml(periodo.dataFim)}</div>
      <div><strong>Gerado em:</strong> ${escaparHtml(periodo.geradoEm || '')}</div>
    </div>
  </div>

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
        <th style="text-align:right">Ficha Gama (Hoje) Ignoradas</th>
        <th style="text-align:center">Situação</th>
      </tr>
    </thead>
    <tbody>
      ${linhasResumoDSI}
    </tbody>
  </table>

  <h2>2. Ocorrências no Renave (27 Unidades Verificadas)</h2>
  ${linhasRenave}

  <h2>3. Detalhamento de Ocorrências — DSI (Por Unidade)</h2>
  ${blocosDetalhesDSI}

  <div class="ref-box">
    <strong>Referência do Chamado — Ordem de Reenvio DSI Toyota:</strong><br/>
    ${ORDEM_REENVIO_TOYOTA.map((p) => escaparHtml(p)).join(' &rarr; ')}
  </div>
</body>
</html>`;
}

function gerarRelatorioMarkdown(periodo, resultadosDSI, resultadosRenave) {
  const linhas = [];
  linhas.push(`# Relatório de Verificação de Integrações DealerNet`);
  linhas.push(`- **Período:** \`${periodo.dataInicio}\` até \`${periodo.dataFim}\``);
  linhas.push(`- **Modo:** Somente leitura (nenhum reenvio executado automaticamente)\n`);

  linhas.push(`## 1. DSI / NDI (Nissan e Toyota)\n`);
  linhas.push(
    `| Unidade | Grupo | Erro | Outros Erros | Com Inconsistências | Pendente | Ficha Gama (Hoje) Desprezadas |`
  );
  linhas.push(`|---|---|---:|---:|---:|---:|---:|`);

  for (const u of resultadosDSI) {
    const cErr = u.porStatus.ERR.registros.length + (u.porStatus.ERR.atingiuLimitePaginas ? '+' : '');
    const cOut = u.porStatus.OUT.registros.length + (u.porStatus.OUT.atingiuLimitePaginas ? '+' : '');
    const cInc = u.porStatus.INC.registros.length + (u.porStatus.INC.atingiuLimitePaginas ? '+' : '');
    const cPen = u.porStatus.PEN.registros.length + (u.porStatus.PEN.atingiuLimitePaginas ? '+' : '');
    linhas.push(
      `| **${u.nome}** | ${u.grupo} | ${cErr} | ${cOut} | ${cInc} | ${cPen} | ${u.desprezadosFichaGamaHoje} |`
    );
  }

  linhas.push(`\n### Detalhamento DSI por Unidade\n`);
  for (const u of resultadosDSI) {
    const todos = [
      ...u.porStatus.ERR.registros,
      ...u.porStatus.OUT.registros,
      ...u.porStatus.INC.registros,
      ...u.porStatus.PEN.registros,
    ];
    if (todos.length === 0) {
      linhas.push(`#### ${u.nome} (${u.grupo}): Sem ocorrências pendentes/erros.\n`);
      continue;
    }
    linhas.push(`#### ${u.nome} (${u.grupo})`);
    for (const st of STATUS_ALVO) {
      const lista = u.porStatus[st.code].registros;
      if (lista.length > 0) {
        linhas.push(`- **${st.label} (${lista.length}${u.porStatus[st.code].atingiuLimitePaginas ? '+' : ''}):**`);
        for (const item of lista.slice(0, 15)) {
          linhas.push(`  - \`${item.raw.replace(/\t+/g, ' | ')}\``);
        }
      }
    }
    linhas.push('');
  }

  linhas.push(`## 2. Renave (Todas as Unidades)\n`);
  const renaveComProblema = resultadosRenave.filter((u) => u.ocorrencias.length > 0);
  if (renaveComProblema.length === 0) {
    linhas.push(`Todas as ${resultadosRenave.length} unidades estão sem erros ou pendências no período.`);
  } else {
    for (const u of renaveComProblema) {
      linhas.push(`### ${u.nome}`);
      for (const oc of u.ocorrencias) {
        linhas.push(`- **[${oc.statusLabel}]** \`${oc.raw.replace(/\t+/g, ' | ')}\``);
      }
      linhas.push('');
    }
  }

  linhas.push(`\n## Referência: Ordem de Reenvio DSI Toyota`);
  for (const passo of ORDEM_REENVIO_TOYOTA) {
    linhas.push(`- ${passo}`);
  }

  return linhas.join('\n');
}

function gerarResumoChamadoTxt(periodo, resultadosDSI, resultadosRenave) {
  const l = [];
  l.push(`VERIFICAÇÃO DE INTEGRAÇÕES DEALERNET (${periodo.dataInicio} a ${periodo.dataFim})`);
  l.push(`========================================================================`);
  l.push(`\n1) NDI NISSAN / DSI TOYOTA:`);

  for (const u of resultadosDSI) {
    const err = u.porStatus.ERR.registros.length;
    const out = u.porStatus.OUT.registros.length;
    const inc = u.porStatus.INC.registros.length;
    const pen = u.porStatus.PEN.registros.length;
    const total = err + out + inc + pen;

    if (total === 0) {
      l.push(`- ${u.nome}: OK (0 erros / 0 pendências)`);
    } else {
      l.push(
        `- ${u.nome}: Erro=${err} | Outros Erros=${out} | Com Inconsistências=${inc} | Pendente=${pen}`
      );
      for (const st of STATUS_ALVO) {
        for (const reg of u.porStatus[st.code].registros.slice(0, 5)) {
          l.push(`    * [${st.label}] ${reg.raw.replace(/\t+/g, ' | ')}`);
        }
      }
    }
  }

  l.push(`\n2) RENAVE (TODAS AS UNIDADES):`);
  const renaveComProblema = resultadosRenave.filter((u) => u.ocorrencias.length > 0);
  if (renaveComProblema.length === 0) {
    l.push(`- Todas as unidades OK (sem erros ou pendências).`);
  } else {
    for (const u of renaveComProblema) {
      l.push(`- ${u.nome}: ${u.ocorrencias.length} ocorrência(s):`);
      for (const oc of u.ocorrencias) {
        l.push(`    * [${oc.statusLabel}] ${oc.raw.replace(/\t+/g, ' | ')}`);
      }
    }
  }

  return l.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Erro fatal na execução:', err);
    process.exit(1);
  });
}
