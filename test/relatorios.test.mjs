import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  gerarRelatorioHtml,
  gerarRelatorioMarkdown,
  gerarResumoChamadoTxt,
  salvarHtmlComoPdf,
} from '../src/relatorios.mjs';

const fixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/resultados-exemplo.json', import.meta.url), 'utf8')
);

test('geradores de relatório usam contagem dinâmica, escapam HTML e exibem falhas/comparação', () => {
  const dsi = structuredClone(fixture.resultadosDSI);
  dsi[0].porStatus.ERR.registros[0].situacaoDelta = 'persistente';
  dsi[0].porStatus.ERR.registros[0].primeiraVezEm = '16/11/2026 às 08:00';
  dsi[0].porStatus.INC.registros[0].situacaoDelta = 'nova';

  const rnv = structuredClone(fixture.resultadosRenave);
  rnv[0].ocorrencias[0].situacaoDelta = 'nova';

  const comparacao = {
    temComparacao: true,
    geradoEmAnterior: '16/11/2026 às 08:00',
    totalNovas: 2,
    totalPersistentes: 1,
    totalResolvidas: 1,
    resolvidas: [
      {
        sistema: 'RNV',
        unidadeNome: 'CRISTAL - TXF',
        statusLabel: 'Pendente',
        codigo: '888',
        data: '16/11/2026 07:00',
        detalhes: 'Resolvido hoje',
        raw: '888\tRNV\t16/11/2026 07:00\tPendente\tResolvido hoje',
      },
    ],
  };

  const falhasColeta = [
    { sistema: 'DSI', unidadeCode: '9', unidadeNome: 'JADE - VDC', erro: 'Timeout na consulta' },
  ];

  const html = gerarRelatorioHtml(fixture.periodo, dsi, rnv, { comparacao, falhasColeta });
  assert.match(html, /Ocorrências no Renave \(2 Unidades Verificadas\)/);
  assert.doesNotMatch(html, /27 Unidades Verificadas/);
  assert.match(html, /Falha XML &lt;tag&gt;/);
  assert.match(html, /Novas: 2/);
  assert.match(html, /Ocorrências Resolvidas Desde a Última Execução/);
  assert.match(html, /Timeout na consulta/);
  assert.match(html, /Limite de paginação do Renave atingido em/);

  const md = gerarRelatorioMarkdown(fixture.periodo, dsi, rnv, { comparacao, falhasColeta });
  assert.match(md, /## 2\. Renave \(2 Unidades Verificadas\)/);
  assert.match(md, /\[NOVA\]/);
  assert.match(md, /## Unidades Não Verificadas/);

  const txt = gerarResumoChamadoTxt(fixture.periodo, dsi, rnv, { comparacao, falhasColeta });
  assert.match(txt, /RESUMO vs 16\/11\/2026 às 08:00: 2 nova\(s\)/);
  assert.match(txt, /ALERTA — UNIDADES NÃO VERIFICADAS \(1\):/);
  assert.match(txt, /2\) RENAVE \(2 UNIDADES VERIFICADAS\):/);
});

test('salvarHtmlComoPdf gera PDF válido em disco via Chromium headless', async () => {
  const html = gerarRelatorioHtml(
    fixture.periodo,
    fixture.resultadosDSI,
    fixture.resultadosRenave
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-test-'));
  const caminhoPdf = path.join(dir, 'teste.pdf');

  try {
    await salvarHtmlComoPdf(html, caminhoPdf, null, true);
    const bytes = fs.readFileSync(caminhoPdf);
    assert.ok(bytes.length > 1000);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), '%PDF');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
