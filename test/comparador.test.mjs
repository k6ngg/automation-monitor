import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  carregarSnapshotAnterior,
  compararComSnapshot,
  salvarSnapshot,
} from '../src/comparador.mjs';

const fixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/resultados-exemplo.json', import.meta.url), 'utf8')
);

test('compararComSnapshot diferencia inicial, nova, persistente e resolvida', () => {
  const primeiro = compararComSnapshot({
    resultadosDSI: fixture.resultadosDSI,
    resultadosRenave: fixture.resultadosRenave,
    falhasColeta: [],
    snapshotAnterior: null,
    geradoEm: '16/11/2026 às 08:00',
    timestampArquivo: '2026-11-16_08-00',
  });

  assert.equal(primeiro.comparacao.temComparacao, false);
  assert.equal(primeiro.resultadosDSI[0].porStatus.ERR.registros[0].situacaoDelta, 'inicial');

  // Segunda execução: 101 persiste, 102 foi resolvida, 103 é nova no DSI
  const segundaDsi = structuredClone(fixture.resultadosDSI);
  segundaDsi[0].porStatus.INC.registros = [];
  segundaDsi[0].porStatus.PEN.registros = [
    {
      raw: '103\tNDI\t17/11/2026 15:00\tPendente\tNovo item',
      cols: ['103', 'NDI', '17/11/2026 15:00', 'Pendente', 'Novo item'],
      codigo: '103',
      integracao: 'NDI',
      data: '17/11/2026 15:00',
      detalhes: 'Pendente | Novo item',
    },
  ];

  const segundo = compararComSnapshot({
    resultadosDSI: segundaDsi,
    resultadosRenave: fixture.resultadosRenave,
    falhasColeta: [],
    snapshotAnterior: primeiro.snapshotParaSalvar,
    geradoEm: '17/11/2026 às 15:30',
    timestampArquivo: '2026-11-17_15-30',
  });

  assert.equal(segundo.comparacao.temComparacao, true);
  assert.equal(segundo.comparacao.totalNovas, 1);
  assert.equal(segundo.comparacao.totalPersistentes, 2); // DSI 101 + RNV 9001
  assert.equal(segundo.comparacao.totalResolvidas, 1); // DSI 102
  assert.equal(segundo.comparacao.resolvidas[0].codigo, '102');
  assert.equal(segundo.resultadosDSI[0].porStatus.ERR.registros[0].situacaoDelta, 'persistente');
  assert.equal(
    segundo.resultadosDSI[0].porStatus.ERR.registros[0].primeiraVezEm,
    '16/11/2026 às 08:00'
  );
  assert.equal(segundo.resultadosDSI[0].porStatus.PEN.registros[0].situacaoDelta, 'nova');
});

test('compararComSnapshot preserva estado de unidades que falharam na coleta', () => {
  const primeiro = compararComSnapshot({
    resultadosDSI: fixture.resultadosDSI,
    resultadosRenave: fixture.resultadosRenave,
    falhasColeta: [],
    snapshotAnterior: null,
    geradoEm: '16/11/2026 às 08:00',
    timestampArquivo: '2026-11-16_08-00',
  });

  // Simula que JADE - ITB (code 4) falhou e não veio em resultadosDSI
  const segundo = compararComSnapshot({
    resultadosDSI: [fixture.resultadosDSI[1]],
    resultadosRenave: fixture.resultadosRenave,
    falhasColeta: [{ sistema: 'DSI', unidadeCode: '4', unidadeNome: 'JADE - ITB', erro: 'Timeout' }],
    snapshotAnterior: primeiro.snapshotParaSalvar,
    geradoEm: '17/11/2026 às 15:30',
    timestampArquivo: '2026-11-17_15-30',
  });

  assert.equal(segundo.comparacao.totalResolvidas, 0);
  assert.ok(segundo.snapshotParaSalvar.ocorrencias['DSI|4|ERR|101|Erro']);
  assert.ok(segundo.snapshotParaSalvar.ocorrencias['DSI|4|INC|102|Com Inconsistências']);
});

test('compararComSnapshot distingue linhas pareadas Envio e Retorno do Envio com mesmo código', () => {
  const dsiPareado = [
    {
      code: '4',
      nome: 'JADE - ITB',
      grupo: 'NDI Nissan',
      porStatus: {
        INC: {
          label: 'Com Inconsistencias',
          registros: [
            {
              raw: '84308191\tNDI Nissan\t17/11/2026 15:46\tEnvio\t279804',
              cols: ['84308191', 'NDI Nissan', '17/11/2026 15:46', 'Envio', '279804'],
              codigo: '84308191',
              data: '17/11/2026 15:46',
            },
            {
              raw: '84308191\tNDI Nissan\t17/11/2026 15:46\tRetorno do Envio\t279804',
              cols: ['84308191', 'NDI Nissan', '17/11/2026 15:46', 'Retorno do Envio', '279804'],
              codigo: '84308191',
              data: '17/11/2026 15:46',
            },
          ],
        },
      },
    },
  ];

  const r1 = compararComSnapshot({
    resultadosDSI: dsiPareado,
    resultadosRenave: [],
    snapshotAnterior: null,
    geradoEm: '17/11/2026 15:47',
  });
  assert.equal(Object.keys(r1.snapshotParaSalvar.ocorrencias).length, 2);

  const r2 = compararComSnapshot({
    resultadosDSI: dsiPareado,
    resultadosRenave: [],
    snapshotAnterior: r1.snapshotParaSalvar,
    geradoEm: '17/11/2026 15:50',
  });
  assert.equal(r2.comparacao.totalPersistentes, 2);
  assert.equal(r2.comparacao.totalResolvidas, 0);
});

test('carregarSnapshotAnterior trata arquivo ausente ou JSON inválido sem lançar erro', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-test-'));
  try {
    assert.equal(carregarSnapshotAnterior(path.join(dir, 'inexistente.json')), null);

    const corrompido = path.join(dir, 'corrompido.json');
    fs.writeFileSync(corrompido, '{json invalido', 'utf8');
    assert.equal(carregarSnapshotAnterior(corrompido), null);

    const valido = path.join(dir, 'valido.json');
    salvarSnapshot(valido, { versao: 1, geradoEm: 'agora', ocorrencias: { k: { codigo: '1' } } });
    const lido = carregarSnapshotAnterior(valido);
    assert.equal(lido.ocorrencias.k.codigo, '1');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
