import assert from 'node:assert/strict';
import test from 'node:test';
import { obterPeriodoMesAtual } from '../src/periodo.mjs';

test('obterPeriodoMesAtual calcula início do mês até hoje formatado', () => {
  const dataFixa = new Date(2026, 0, 5, 8, 5); // 05/01/2026 08:05
  const periodo = obterPeriodoMesAtual(dataFixa, {});

  assert.equal(periodo.dataHojePrefixo, '05/01/2026');
  assert.equal(periodo.dataInicio, '01/01/2026 00:00');
  assert.equal(periodo.dataFim, '05/01/2026 23:59');
  assert.equal(periodo.geradoEm, '05/01/2026 às 08:05');
  assert.equal(periodo.timestampArquivo, '2026-01-05_08-05');
});

test('obterPeriodoMesAtual respeita override de DATA_INICIO e DATA_FIM', () => {
  const dataFixa = new Date(2026, 11, 31, 23, 59); // 31/12/2026 23:59
  const periodo = obterPeriodoMesAtual(dataFixa, {
    DATA_INICIO: '15/12/2026 00:00',
    DATA_FIM: '20/12/2026 23:59',
  });

  assert.equal(periodo.dataInicio, '15/12/2026 00:00');
  assert.equal(periodo.dataFim, '20/12/2026 23:59');
  assert.equal(periodo.timestampArquivo, '2026-12-31_23-59');
});
