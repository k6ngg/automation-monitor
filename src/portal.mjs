import fs from 'node:fs';
import path from 'node:path';
import {
  deveDesprezarFichaGama,
  parsearLinhasTabela,
  statusCorresponde,
} from './regras.mjs';

/**
 * Seleciona opção em dropdown GeneXus garantindo disparo de onchange/onblur.
 */
export async function selecionarDropdownGX(frame, selector, value) {
  const el = frame.locator(selector);
  await el.selectOption(value);
  await el.dispatchEvent('change');
  await el.dispatchEvent('blur');
}

/**
 * Aguarda o overlay de carregamento AJAX do GeneXus desaparecer.
 */
export async function aguardarLoadingGX(frame, timeout = 30000) {
  await frame
    .locator('#gx_ajax_notification')
    .waitFor({ state: 'hidden', timeout })
    .catch(() => null);
}

/**
 * Executa um clique que dispara POST AJAX do GeneXus no iframe e aguarda a resposta real.
 */
export async function clicarEAguardarAjax(page, frame, locator, timeout = 30000) {
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
 * Realiza login e abre a tela Integração > Cadastro > Monitor (somente leitura).
 */
export async function autenticarEAbrirMonitor(page, configPortal, logger) {
  logger.info('-> Acessando portal DealerNet...');
  await page.goto(configPortal.url, { waitUntil: 'load', timeout: 60000 });

  const userField = page.locator(
    '#vUSUARIO_IDENTIFICADORALTERNATIVO, input[name*="USUARIO_IDENTIFICADOR"]'
  );
  const btnIntegracao = page.getByRole('button', { name: 'Integração' });

  await userField.first().or(btnIntegracao).waitFor({ state: 'visible', timeout: 30000 });

  if (await userField.first().isVisible()) {
    logger.info(`-> Realizando login com usuário ${configPortal.user}...`);
    await userField.first().fill(configPortal.user);
    await page
      .locator('#vUSUARIOSENHA_SENHA, input[name*="SENHA"]')
      .first()
      .fill(configPortal.pass);
    await page.locator('#IMAGE3').click();
    await btnIntegracao.waitFor({ state: 'visible', timeout: 30000 });
  }

  logger.info('-> Abrindo menu Integração > Cadastro > Monitor...');
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
  logger.info('-> Tela Monitor carregada com sucesso.');
  return frame;
}

/**
 * Verifica se a sessão expirou e refaz login/abertura do Monitor se necessário.
 */
export async function garantirSessaoAtiva(page, frame, configPortal, logger) {
  const url = page.url();
  const countSistema = await frame.locator('#vMONITOR_SISTEMA').count();
  if (url.includes('Login') || url.includes('login') || countSistema === 0) {
    logger.warn('   [!] Sessão expirada detectada. Reconectando...');
    return await autenticarEAbrirMonitor(page, configPortal, logger);
  }
  return frame;
}

/**
 * Garante que o sistema e o período estejam preenchidos no filtro do Monitor.
 */
async function garantirSistemaEPeriodo(
  page,
  frameAtual,
  sistemaCodigo,
  periodo,
  configPortal,
  logger,
  forcarPreenchimento = false
) {
  const frame = await garantirSessaoAtiva(page, frameAtual, configPortal, logger);
  const sistemaAtual = await frame.locator('#vMONITOR_SISTEMA').inputValue();

  if (forcarPreenchimento || sistemaAtual !== sistemaCodigo) {
    await selecionarDropdownGX(frame, '#vMONITOR_SISTEMA', sistemaCodigo);
    await page.waitForTimeout(2000);
    await frame.locator('#vMONITOR_DATA').fill(periodo.dataInicio);
    await frame.locator('#vMONITOR_DATA_TO').fill(periodo.dataFim);
  }

  return frame;
}

/**
 * Extrai as linhas visíveis na tabela do Monitor.
 */
export async function extrairLinhasDaPagina(frame) {
  const bodyText = await frame.locator('body').innerText();
  return parsearLinhasTabela(bodyText);
}

/**
 * Retorna para a página 1 do grid GeneXus caso o botão de primeira página esteja ativo.
 */
async function voltarParaPrimeiraPagina(page, frame) {
  const firstBtn = frame.locator('span.PagingButtonsFirst[onclick]');
  if ((await firstBtn.count()) > 0) {
    await clicarEAguardarAjax(page, frame, firstBtn.first(), 15000).catch(() => null);
  }
}

/**
 * Executa a consulta para uma combinação de Empresa + Status e percorre a paginação (somente leitura).
 */
export async function consultarStatus(page, frame, statusObj, maxPages) {
  const { code: statusCode, label: statusLabel } = statusObj;

  await selecionarDropdownGX(frame, '#vMONITOR_STATUS', statusCode);
  await page.waitForTimeout(250);

  const statusAtual = await frame.locator('#vMONITOR_STATUS').inputValue();
  if (statusAtual !== statusCode) {
    await selecionarDropdownGX(frame, '#vMONITOR_STATUS', statusCode);
    await page.waitForTimeout(250);
  }

  // Se a consulta anterior terminou em página > 1, volta para a página 1 antes e após atualizar
  await voltarParaPrimeiraPagina(page, frame);
  await clicarEAguardarAjax(page, frame, frame.locator('#IMGATUALIZAR'));
  await voltarParaPrimeiraPagina(page, frame);

  const todasLinhas = [];
  let paginaAtual = 1;
  let temMaisPaginas = false;

  while (paginaAtual <= maxPages) {
    const linhas = await extrairLinhasDaPagina(frame);
    const linhasDoStatus = linhas.filter((l) => statusCorresponde(l.cols, statusLabel));

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
 * Salva screenshot de evidência em pasta dedicada caso uma unidade falhe na coleta.
 */
async function capturarEvidenciaErro(page, pastaErros, nomeArquivo, logger) {
  try {
    fs.mkdirSync(pastaErros, { recursive: true });
    const caminho = path.join(pastaErros, nomeArquivo);
    await page.screenshot({ path: caminho, fullPage: true });
    return caminho;
  } catch (err) {
    logger.warn(`   [!] Não foi possível salvar screenshot de erro (${err.message}).`);
    return null;
  }
}

/**
 * Loop compartilhado com tolerância a falhas por unidade.
 */
async function percorrerUnidadesComTolerancia({
  page,
  frameInicial,
  sistemaCodigo,
  unidades,
  periodo,
  configPortal,
  pastaErros,
  logger,
  coletarUnidade,
}) {
  let frame = await garantirSistemaEPeriodo(
    page,
    frameInicial,
    sistemaCodigo,
    periodo,
    configPortal,
    logger,
    true
  );

  const resultados = [];
  const falhas = [];

  for (const unidade of unidades) {
    try {
      frame = await garantirSistemaEPeriodo(
        page,
        frame,
        sistemaCodigo,
        periodo,
        configPortal,
        logger,
        false
      );

      await selecionarDropdownGX(frame, '#vMONITOR_EMPRESACOD', unidade.code);
      await page.waitForTimeout(300);

      const resultado = await coletarUnidade(frame, unidade);
      resultados.push(resultado);
    } catch (err) {
      const nomeImg = `${sistemaCodigo.toLowerCase()}-${unidade.code}-${periodo.timestampArquivo}.png`;
      const screenshot = await capturarEvidenciaErro(page, pastaErros, nomeImg, logger);
      logger.error(
        `   [ERRO] Falha ao consultar ${sistemaCodigo} | ${unidade.nome} (cod ${unidade.code}): ${err.message}`,
        err
      );
      falhas.push({
        sistema: sistemaCodigo,
        unidadeCode: unidade.code,
        unidadeNome: unidade.nome,
        erro: err.message,
        screenshot,
      });

      frame = await autenticarEAbrirMonitor(page, configPortal, logger).catch(() => frame);
    }
  }

  return { frame, resultados, falhas };
}

/**
 * Coleta todas as unidades configuradas em DSI (NDI Nissan + DSI Toyota).
 */
export async function coletarDSI({
  page,
  frame,
  unidades,
  statusAlvo,
  maxPages,
  periodo,
  desprezarFichaGamaDoDia,
  configPortal,
  pastaErros,
  logger,
}) {
  return percorrerUnidadesComTolerancia({
    page,
    frameInicial: frame,
    sistemaCodigo: 'DSI',
    unidades,
    periodo,
    configPortal,
    pastaErros,
    logger,
    async coletarUnidade(frameAtual, unidade) {
      logger.info(`  -> Unidade DSI: ${unidade.nome} (${unidade.grupo})`);
      const porStatus = {};
      let desprezadosFichaGamaHoje = 0;

      for (const st of statusAlvo) {
        const res = await consultarStatus(page, frameAtual, st, maxPages);

        const filtrados = res.registros.filter((reg) => {
          if (
            deveDesprezarFichaGama(
              reg,
              unidade,
              periodo.dataHojePrefixo,
              desprezarFichaGamaDoDia
            )
          ) {
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

      return {
        ...unidade,
        porStatus,
        desprezadosFichaGamaHoje,
      };
    },
  });
}

/**
 * Coleta todas as unidades configuradas em Renave (RNV).
 */
export async function coletarRenave({
  page,
  frame,
  unidades,
  statusAlvo,
  maxPages,
  periodo,
  configPortal,
  pastaErros,
  logger,
}) {
  return percorrerUnidadesComTolerancia({
    page,
    frameInicial: frame,
    sistemaCodigo: 'RNV',
    unidades,
    periodo,
    configPortal,
    pastaErros,
    logger,
    async coletarUnidade(frameAtual, unidade) {
      logger.info(`  -> Unidade Renave: ${unidade.nome}`);
      const ocorrencias = [];
      const limitesAtingidos = [];

      for (const st of statusAlvo) {
        const res = await consultarStatus(page, frameAtual, st, maxPages);
        if (res.atingiuLimitePaginas) {
          limitesAtingidos.push(st.label);
        }
        for (const r of res.registros) {
          ocorrencias.push({ statusCode: st.code, statusLabel: st.label, ...r });
        }
      }

      return {
        ...unidade,
        ocorrencias,
        limitesAtingidos,
      };
    },
  });
}
