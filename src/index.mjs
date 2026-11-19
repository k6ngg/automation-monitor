import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { STATUS_ALVO, UNIDADES_DSI, UNIDADES_RENAVE } from '../config.mjs';
import {
  carregarSnapshotAnterior,
  compararComSnapshot,
  salvarSnapshot,
} from './comparador.mjs';
import { anotarDiagnosticos } from './diagnosticador.mjs';
import { criarLogger } from './logger.mjs';
import { enviarRelatorioPorEmail, validarConfigEmail } from './notificador-email.mjs';
import { obterPeriodoMesAtual } from './periodo.mjs';
import { autenticarEAbrirMonitor, coletarDSI, coletarRenave } from './portal.mjs';
import { resumirExecucao } from './regras.mjs';
import {
  gerarRelatorioHtml,
  gerarRelatorioMarkdown,
  gerarResumoChamadoTxt,
  salvarHtmlComoPdf,
} from './relatorios.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Executa o fluxo completo de verificação somente leitura do DealerNet.
 *
 * Códigos de saída:
 * - 0: Concluído sem ocorrências e sem falhas
 * - 1: Erro fatal (configuração ausente, falha no login, erro de envio ou exceção inesperada)
 * - 2: Concluído com ocorrências a verificar
 * - 3: Concluído com falha parcial em uma ou mais unidades
 */
export async function main() {
  dotenv.config({ path: path.join(ROOT_DIR, '.env') });

  const DEALERNET_URL = process.env.DEALERNET_URL;
  const DEALERNET_USER = process.env.DEALERNET_USER;
  const DEALERNET_PASS = process.env.DEALERNET_PASS;
  const HEADLESS = process.env.HEADLESS !== 'false';
  const MAX_PAGES = Number(process.env.MAX_PAGES_PER_STATUS || 5);
  const MAX_PAGES_RENAVE = Number(process.env.MAX_PAGES_RENAVE || 2);
  const DESPREZAR_FICHA_GAMA_DO_DIA =
    process.env.DESPREZAR_FICHA_GAMA_DO_DIA !== 'false';

  if (!DEALERNET_URL || !DEALERNET_USER || !DEALERNET_PASS) {
    console.error(
      'Erro: defina DEALERNET_URL, DEALERNET_USER e DEALERNET_PASS no arquivo .env antes de executar.'
    );
    process.exit(1);
  }

  try {
    validarConfigEmail(process.env);
  } catch (err) {
    console.error(`Erro de configuração de e-mail: ${err.message}`);
    process.exit(1);
  }

  const periodo = obterPeriodoMesAtual();
  const pastaRelatorios = path.join(ROOT_DIR, 'relatorios');
  const pastaErros = path.join(pastaRelatorios, 'erros');
  const caminhoLog = path.join(pastaRelatorios, `execucao-${periodo.timestampArquivo}.log`);
  const caminhoSnapshot = path.join(pastaRelatorios, '.ultimo-snapshot.json');
  const logger = criarLogger(caminhoLog);

  logger.info('====================================================================');
  logger.info(' VERIFICAÇÃO DE INTEGRAÇÕES DEALERNET (MODO SOMENTE-LEITURA)');
  logger.info(` Período: ${periodo.dataInicio} até ${periodo.dataFim}`);
  logger.info('====================================================================');

  const configPortal = {
    url: DEALERNET_URL,
    user: DEALERNET_USER,
    pass: DEALERNET_PASS,
  };

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  let resultadosDSI = [];
  let resultadosRenave = [];
  const falhasColeta = [];

  try {
    const frameInicial = await autenticarEAbrirMonitor(page, configPortal, logger);

    logger.info('\n[1/2] Consultando Sistema = DSI...');
    const coletaDsi = await coletarDSI({
      page,
      frame: frameInicial,
      unidades: UNIDADES_DSI,
      statusAlvo: STATUS_ALVO,
      maxPages: MAX_PAGES,
      periodo,
      desprezarFichaGamaDoDia: DESPREZAR_FICHA_GAMA_DO_DIA,
      configPortal,
      pastaErros,
      logger,
    });
    resultadosDSI = coletaDsi.resultados;
    falhasColeta.push(...coletaDsi.falhas);

    logger.info('\n[2/2] Consultando Sistema = Renave (RNV)...');
    const coletaRnv = await coletarRenave({
      page,
      frame: coletaDsi.frame,
      unidades: UNIDADES_RENAVE,
      statusAlvo: STATUS_ALVO,
      maxPages: MAX_PAGES_RENAVE,
      periodo,
      configPortal,
      pastaErros,
      logger,
    });
    resultadosRenave = coletaRnv.resultados;
    falhasColeta.push(...coletaRnv.falhas);

    const snapshotAnterior = carregarSnapshotAnterior(caminhoSnapshot, logger);
    const resultadoDiff = compararComSnapshot({
      resultadosDSI,
      resultadosRenave,
      falhasColeta,
      snapshotAnterior,
      geradoEm: periodo.geradoEm,
      timestampArquivo: periodo.timestampArquivo,
    });

    const diagnosticado = anotarDiagnosticos({
      resultadosDSI: resultadoDiff.resultadosDSI,
      resultadosRenave: resultadoDiff.resultadosRenave,
    });
    resultadosDSI = diagnosticado.resultadosDSI;
    resultadosRenave = diagnosticado.resultadosRenave;
    const { comparacao, snapshotParaSalvar } = resultadoDiff;
    const resumo = resumirExecucao(resultadosDSI, resultadosRenave, falhasColeta);

    const caminhoPdf = path.join(pastaRelatorios, `relatorio-${periodo.timestampArquivo}.pdf`);
    const caminhoMd = path.join(pastaRelatorios, `relatorio-${periodo.timestampArquivo}.md`);
    const caminhoTxt = path.join(pastaRelatorios, `chamado-${periodo.timestampArquivo}.txt`);

    const opcoesRelatorio = { comparacao, falhasColeta };
    const conteudoHtml = gerarRelatorioHtml(
      periodo,
      resultadosDSI,
      resultadosRenave,
      opcoesRelatorio
    );
    const conteudoMd = gerarRelatorioMarkdown(
      periodo,
      resultadosDSI,
      resultadosRenave,
      opcoesRelatorio
    );
    const conteudoTxt = gerarResumoChamadoTxt(
      periodo,
      resultadosDSI,
      resultadosRenave,
      opcoesRelatorio
    );

    await salvarHtmlComoPdf(conteudoHtml, caminhoPdf, browser, HEADLESS);
    fs.writeFileSync(caminhoMd, conteudoMd, 'utf8');
    fs.writeFileSync(caminhoTxt, conteudoTxt, 'utf8');
    salvarSnapshot(caminhoSnapshot, snapshotParaSalvar);

    logger.info('\n====================================================================');
    logger.info(' VERIFICAÇÃO CONCLUÍDA!');
    logger.info(` Relatório em PDF:              ${caminhoPdf}`);
    logger.info(` Relatório em Markdown:         ${caminhoMd}`);
    logger.info(` Texto pronto para o chamado:   ${caminhoTxt}`);
    logger.info(` Log da execução:               ${caminhoLog}`);
    if (comparacao.temComparacao) {
      logger.info(
        ` Comparação:                    ${comparacao.totalNovas} nova(s) | ${comparacao.totalPersistentes} persistente(s) | ${comparacao.totalResolvidas} resolvida(s)`
      );
    }
    if (falhasColeta.length > 0) {
      logger.warn(` Unidades com falha na coleta:  ${falhasColeta.length}`);
    }
    logger.info('====================================================================\n');

    let erroEmail = false;
    try {
      await enviarRelatorioPorEmail({
        env: process.env,
        periodo,
        resumo,
        comparacao,
        textoChamado: conteudoTxt,
        htmlRelatorio: conteudoHtml,
        caminhoPdf,
        logger,
      });
    } catch (err) {
      erroEmail = true;
      logger.error(`Erro ao enviar e-mail via Zoho Mail: ${err.message}`, err);
    }

    if (erroEmail) {
      process.exitCode = 1;
    } else if (falhasColeta.length > 0) {
      process.exitCode = 3;
    } else if (resumo.totalOcorrencias > 0) {
      process.exitCode = 2;
    } else {
      process.exitCode = 0;
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Erro fatal na execução:', err);
    process.exit(1);
  });
}
