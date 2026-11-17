import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deveDesprezarFichaGama,
  ehUnidadeJade,
  parsearLinhasTabela,
  statusCorresponde,
} from '../src/regras.mjs';

test('ehUnidadeJade identifica apenas unidades NDI Nissan / JADE', () => {
  assert.equal(ehUnidadeJade({ nome: 'JADE - ITB', grupo: 'NDI Nissan' }), true);
  assert.equal(ehUnidadeJade({ nome: 'JADE MOTOS - MATRIZ' }), true);
  assert.equal(ehUnidadeJade({ nome: 'TOPAZIO MATRIZ', grupo: 'DSI Toyota' }), false);
  assert.equal(ehUnidadeJade({ nome: 'CRISTAL - ITB' }), false);
});

test('deveDesprezarFichaGama aplica-se apenas a JADE e pela coluna data', () => {
  const jade = { code: '4', nome: 'JADE - ITB', grupo: 'NDI Nissan' };
  const toyota = { code: '12', nome: 'TOPAZIO MATRIZ', grupo: 'DSI Toyota' };
  const hoje = '17/11/2026';

  const fichaHoje = {
    data: '17/11/2026 09:15',
    raw: '123\tNDI\t17/11/2026 09:15\tErro\tFicha Gama - erro pendente',
  };
  const fichaOntemComDataHojeNaObs = {
    data: '16/11/2026 18:00',
    raw: '124\tNDI\t16/11/2026 18:00\tErro\tFicha Gama reprocessar em 17/11/2026',
  };

  assert.equal(deveDesprezarFichaGama(fichaHoje, jade, hoje, true), true);
  assert.equal(deveDesprezarFichaGama(fichaHoje, toyota, hoje, true), false);
  assert.equal(deveDesprezarFichaGama(fichaOntemComDataHojeNaObs, jade, hoje, true), false);
  assert.equal(deveDesprezarFichaGama(fichaHoje, jade, hoje, false), false);
});

test('statusCorresponde ignora acentos e caixa alta/baixa', () => {
  assert.equal(
    statusCorresponde(['101', 'NDI', '17/11/2026', 'Com Inconsistências'], 'Com Inconsistencias'),
    true
  );
  assert.equal(
    statusCorresponde(['101', 'NDI', '17/11/2026', 'com inconsistencias'], 'Com Inconsistências'),
    true
  );
  assert.equal(statusCorresponde(['101', 'NDI', 'ERRO'], 'Erro'), true);
  assert.equal(statusCorresponde(['101', 'NDI', 'Outros Erros'], 'Erro'), false);
});

test('parsearLinhasTabela extrai linhas válidas e ignora textos fora da tabela', () => {
  const texto = [
    'Filtro aplicado com sucesso',
    'Código\tIntegração\tData\tStatus\tObservação',
    '5001\tNDI\t17/11/2026 08:30\tErro\tTimeout WS',
    '5002\tNDI\t17/11/2026 09:00\tPendente\tAguardando fila',
    'Página 1 de 1',
  ].join('\n');

  const linhas = parsearLinhasTabela(texto);
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].codigo, '5001');
  assert.equal(linhas[0].integracao, 'NDI');
  assert.equal(linhas[0].data, '17/11/2026 08:30');
  assert.equal(linhas[0].detalhes, 'Erro | Timeout WS');

  assert.deepEqual(parsearLinhasTabela('Nenhum registro encontrado'), []);
});
