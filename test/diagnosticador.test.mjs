import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anotarDiagnosticos,
  diagnosticarOcorrencia,
  extrairChaveNegocio,
  gerarPlaybookResumo,
} from '../src/diagnosticador.mjs';

function criarReg(raw) {
  const cols = raw.split('\t').map((c) => c.trim());
  return {
    raw,
    cols,
    codigo: cols[0] || '',
    integracao: cols[1] || '',
    data: cols[2] || '',
    detalhes: cols.slice(3).join(' | '),
  };
}

test('diagnosticarOcorrencia classifica corretamente erros reais de NDI Nissan', () => {
  const clienteInvalido = criarReg(
    '83915588\tNDI Nissan\t17/11/2026 17:27\tEnvio\t410627\tOutros Erros\tDSINissan Cadastro Cliente\tENVIO_WS_17/11/2026\tCód Cliente: 410627CPF/CNPJ informado para o Cliente é Inválido;'
  );
  const d1 = diagnosticarOcorrencia(clienteInvalido, {
    sistema: 'DSI',
    grupo: 'NDI Nissan',
    statusCode: 'OUT',
  });
  assert.equal(d1.regraId, 'NDI_CLIENTE_CPF_CNPJ');
  assert.equal(d1.acao, 'CORRIGIR_CADASTRO');
  assert.match(d1.ordemPrecedencia, /NDI 1\/3/);
  assert.equal(extrairChaveNegocio(clienteInvalido), '410627');

  const veiculoDm004 = criarReg(
    '84308747\tNDI Nissan\t17/11/2026 17:25\tEnvio\t279804\tCom Inconsistencias\tDSINissan Cadastro Veículo\tENVIO_WS_17/11/2026_279804\tInclusao WS-DM004 - Consulta Veiculo.'
  );
  const d2 = diagnosticarOcorrencia(veiculoDm004, {
    sistema: 'DSI',
    grupo: 'NDI Nissan',
    statusCode: 'INC',
  });
  assert.equal(d2.regraId, 'NDI_VEICULO_DM004');
  assert.equal(d2.acao, 'CORRIGIR_CADASTRO');

  const nfPendente = criarReg(
    '84308753\tNDI Nissan\t17/11/2026 17:27\t1516401\t29261110929425000133550020000842121125564831\tPendente\tDSINissan Nota Fiscais\tInclusao WS-NF001 -Notas Fiscais Eletronicas'
  );
  const d3 = diagnosticarOcorrencia(nfPendente, {
    sistema: 'DSI',
    grupo: 'NDI Nissan',
    statusCode: 'PEN',
  });
  assert.equal(d3.regraId, 'NDI_NOTA_FISCAL_NF001');
  assert.equal(d3.acao, 'REENVIAR_NA_ORDEM');
  assert.equal(d3.podeReenviarDireto, true);
  assert.match(d3.ordemPrecedencia, /NDI 3\/3/);

  const nfAguardandoProposta = criarReg(
    '84309000\tNDI Nissan\t17/11/2026 17:30\tEnvio\t1516402\tCom Inconsistencias\tDSINissan Nota Fiscais\tRegistro da Proposta do Veículo 94DFCAP15VE201332 não enviado para a Montadora'
  );
  const d4 = diagnosticarOcorrencia(nfAguardandoProposta, {
    sistema: 'DSI',
    grupo: 'NDI Nissan',
    statusCode: 'INC',
  });
  assert.equal(d4.regraId, 'NDI_NOTA_FISCAL_NF001');
  assert.match(d4.ordemPrecedencia, /NDI 3\/3/);
});

test('diagnosticarOcorrencia classifica bloqueios de negócio, cadastros e infra no DSI Toyota', () => {
  const giveUp = criarReg(
    '43162714\tToyota\t17/11/2026 17:25\tEnvio\t89143\t87345\tErro\tAcompanhamento - [saveAppointment]\tXML_TSA43162714\t125 - OPERACAO INVALIDA. FICHA POSSUI GIVE UP Ficha: 16'
  );
  const dGiveUp = diagnosticarOcorrencia(giveUp, {
    sistema: 'DSI',
    grupo: 'DSI Toyota',
    statusCode: 'ERR',
  });
  assert.equal(dGiveUp.regraId, 'TOYOTA_125_GIVE_UP');
  assert.equal(dGiveUp.acao, 'BLOQUEIO_NEGOCIO');
  assert.equal(dGiveUp.podeReenviarDireto, false);

  const pedidoCancelado = criarReg(
    '38044764\tToyota\t17/11/2026 17:19\tEnvio\t1782\t87169\tErro\tPrevisão de Fatura - [saveRetailForecast]\tXML_SRF38044764\t59 - SITUAÇÃO ATUAL DO PEDIDO CANCELADO - OPERAÇÃO INVÁLIDA'
  );
  assert.equal(
    diagnosticarOcorrencia(pedidoCancelado, { sistema: 'DSI', grupo: 'DSI Toyota', statusCode: 'ERR' }).regraId,
    'TOYOTA_59_PEDIDO_CANCELADO'
  );

  const pedidoAtivo = criarReg(
    '38138419\tToyota\t17/11/2026 17:16\tEnvio\t107779\t84022\tErro\tDesistencia - [saveGiveUp]\tXML_TGU38138419\t119 - OPERACAO INVALIDA. FICHA POSSUI PEDIDO ATIVO'
  );
  assert.equal(
    diagnosticarOcorrencia(pedidoAtivo, { sistema: 'DSI', grupo: 'DSI Toyota', statusCode: 'ERR' }).regraId,
    'TOYOTA_119_PEDIDO_ATIVO'
  );

  const outroConcessionario = criarReg(
    '84303532\tToyota\t16/11/2026 17:18\tEnvio\t1507468\tErro\tEntrada em Estoque - [saveReceiveVehicle]\tXML_TSR84303532\t361 - VEICULO NAO PERTENCE AO CONCESSIONARIO'
  );
  assert.equal(
    diagnosticarOcorrencia(outroConcessionario, { sistema: 'DSI', grupo: 'DSI Toyota', statusCode: 'ERR' }).regraId,
    'TOYOTA_361_OUTRO_CONCESSIONARIO'
  );

  const fichaInexistente = criarReg(
    '84272128\tToyota\t14/11/2026 10:27\tEnvio\t560136\t560136\tErro\tUnlink Avaliação Ficha - [unlinkCardValuation]\tXML_TUC84272128\t2 - OPERAÇÃO INVÁLIDA - FICHA INEXISTENTE'
  );
  assert.equal(
    diagnosticarOcorrencia(fichaInexistente, { sistema: 'DSI', grupo: 'DSI Toyota', statusCode: 'ERR' }).regraId,
    'TOYOTA_2_FICHA_INEXISTENTE'
  );

  const emRevalidacao = criarReg(
    '84290558\tToyota\t14/11/2026 10:35\tEnvio\t1376607\t533808\tErro\tFicha Redirecionada - [saveCardRevalidationReceive]\tXML_CRR84290558\t364 - FICHA ESTA EM REVALIDACAO DE NEGOGIO.'
  );
  assert.equal(
    diagnosticarOcorrencia(emRevalidacao, { sistema: 'DSI', grupo: 'DSI Toyota', statusCode: 'ERR' }).regraId,
    'TOYOTA_364_REVALIDACAO'
  );

  const dataInvalida = criarReg(
    '84295791\tToyota\t14/11/2026 13:09\tEnvio\t89031\t562006\tErro\tPrevisão de Emplacamento - [saveRegistration]\tXML_SRE84295791\t9 - DATA INVÁLIDA'
  );
  const dData = diagnosticarOcorrencia(dataInvalida, {
    sistema: 'DSI',
    grupo: 'DSI Toyota',
    statusCode: 'ERR',
  });
  assert.equal(dData.regraId, 'TOYOTA_9_DATA_INVALIDA');
  assert.equal(dData.acao, 'CORRIGIR_CADASTRO');
  assert.match(dData.ordemPrecedencia, /Toyota 7\/8/);

  const fkBancoPedido = criarReg(
    '84286940\tToyota\t17/11/2026 15:46\tEnvio\t5005643\t9BRAD8AF7V3038530\tErro\tVehicle (Plano Mensal) - [findAllVehicle]\tThe INSERT statement conflicted with the FOREIGN KEY constraint "IBANCOPEDIDOHISTORICO2"'
  );
  assert.equal(
    diagnosticarOcorrencia(fkBancoPedido, { sistema: 'DSI', grupo: 'DSI Toyota', statusCode: 'ERR' }).acao,
    'INFRA_OU_CHAMADO'
  );

  const prePaid = criarReg(
    '84308086\tToyota\t17/11/2026 15:31\t0\t7VE261117394_E0.txt\tErro\tPre Paid - [savePrePaid]\tErro ao tetar importar o arquivo!'
  );
  assert.equal(
    diagnosticarOcorrencia(prePaid, { sistema: 'DSI', grupo: 'DSI Toyota', statusCode: 'ERR' }).regraId,
    'TOYOTA_PREPAID_ARQUIVO'
  );

  const loteOsr = criarReg(
    '84308479\tToyota\t17/11/2026 16:18\tEnvio\t0\tOSR_4299170_20260818161851_D.txt\tPendente\tInt Toyota OS Aberta, M.Preco, OS Acomp. *\tArquivo gerado com sucesso.'
  );
  assert.equal(
    diagnosticarOcorrencia(loteOsr, { sistema: 'DSI', grupo: 'DSI Toyota', statusCode: 'PEN' }).acao,
    'AGUARDAR_FILA'
  );

  const entregaPendente = criarReg(
    '84306048\tToyota\t17/11/2026 09:21\t89098\tPendente\tEntrega - [saveDelivery]'
  );
  const dEntrega = diagnosticarOcorrencia(entregaPendente, {
    sistema: 'DSI',
    grupo: 'DSI Toyota',
    statusCode: 'PEN',
  });
  assert.equal(dEntrega.acao, 'REENVIAR_NA_ORDEM');
  assert.match(dEntrega.ordemPrecedencia, /Toyota 8\/8/);
});

test('diagnosticarOcorrencia classifica corretamente erros e pendências do RENAVE', () => {
  const cert401 = criarReg(
    '9001\tRNV\t17/11/2026 11:20\tErro\tThe remote server returned an error: (401) Unauthorized'
  );
  assert.equal(
    diagnosticarOcorrencia(cert401, { sistema: 'RNV', statusCode: 'ERR' }).regraId,
    'RNV_401_CERTIFICADO'
  );

  const charInvalido = criarReg(
    '9002\tRNV\t17/11/2026 11:21\tErro\tComplemento possui caractere inválido *'
  );
  assert.equal(
    diagnosticarOcorrencia(charInvalido, { sistema: 'RNV', statusCode: 'ERR' }).regraId,
    'RNV_CARACTERE_INVALIDO'
  );

  const consultaBloqueada = criarReg(
    '9003\tRNV\t17/11/2026 11:22\tErro\tRegistro de Consulta Renave não permitido envio/reenvio.'
  );
  assert.equal(
    diagnosticarOcorrencia(consultaBloqueada, { sistema: 'RNV', statusCode: 'ERR' }).acao,
    'BLOQUEIO_NEGOCIO'
  );

  const erroSemDescricao = criarReg('9004\tRNV\t17/11/2026 11:25\tErro\tSaída Veículo Novo Renave');
  const dOculto = diagnosticarOcorrencia(erroSemDescricao, { sistema: 'RNV', statusCode: 'ERR' });
  assert.equal(dOculto.regraId, 'RNV_ERRO_INVESTIGAR_HISTORICO');
  assert.match(dOculto.passosResolucao, /SERPRO_RENAVE/);
});

test('anotarDiagnosticos e gerarPlaybookResumo agrupam ocorrências e preservam imutabilidade', () => {
  const dsi = [
    {
      code: '13',
      nome: 'TOPÁZIO – ITB',
      grupo: 'DSI Toyota',
      porStatus: {
        ERR: {
          label: 'Erro',
          registros: [
            criarReg(
              '43162714\tToyota\t17/11/2026 17:25\tEnvio\t89143\t87345\tErro\t125 - OPERACAO INVALIDA. FICHA POSSUI GIVE UP'
            ),
            criarReg(
              '42014954\tToyota\t17/11/2026 17:25\tEnvio\t88959\t86097\tErro\t125 - OPERACAO INVALIDA. FICHA POSSUI GIVE UP'
            ),
          ],
        },
        OUT: { label: 'Outros Erros', registros: [] },
        INC: { label: 'Com Inconsistencias', registros: [] },
        PEN: { label: 'Pendente', registros: [] },
      },
    },
  ];
  const rnv = [
    {
      code: '19',
      nome: 'CRISTAL - ITB',
      ocorrencias: [
        {
          statusCode: 'ERR',
          statusLabel: 'Erro',
          ...criarReg('9002\tRNV\t17/11/2026 11:21\tErro\tComplemento possui caractere inválido'),
        },
      ],
    },
  ];

  const anotado = anotarDiagnosticos({ resultadosDSI: dsi, resultadosRenave: rnv });
  assert.equal(dsi[0].porStatus.ERR.registros[0].diagnostico, undefined);
  assert.equal(anotado.resultadosDSI[0].porStatus.ERR.registros[0].diagnostico.regraId, 'TOYOTA_125_GIVE_UP');
  assert.equal(anotado.resultadosRenave[0].ocorrencias[0].diagnostico.regraId, 'RNV_CARACTERE_INVALIDO');

  const playbook = gerarPlaybookResumo(anotado.resultadosDSI, anotado.resultadosRenave);
  assert.equal(playbook.length, 2);
  assert.equal(playbook[0].regraId, 'TOYOTA_125_GIVE_UP');
  assert.equal(playbook[0].totalOcorrencias, 2);
  assert.deepEqual(playbook[0].chavesAmostra, ['89143', '88959']);
  assert.equal(playbook[1].regraId, 'RNV_CARACTERE_INVALIDO');
});
