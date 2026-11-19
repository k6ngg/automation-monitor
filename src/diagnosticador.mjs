import { normalizarTexto } from './regras.mjs';

/**
 * Categorias de ação baseadas na documentação oficial da Central de Ajuda Dealernet.
 */
export const ACOES_DIAGNOSTICO = {
  BLOQUEIO_NEGOCIO: {
    codigo: 'BLOQUEIO_NEGOCIO',
    label: 'Não Reenviar (Regra Montadora)',
    badgeClass: 'badge-diag-bloqueio',
    podeReenviarDireto: false,
    ordemGrupo: 1,
  },
  CORRIGIR_CADASTRO: {
    codigo: 'CORRIGIR_CADASTRO',
    label: 'Corrigir Cadastro + Reenviar',
    badgeClass: 'badge-diag-cadastro',
    podeReenviarDireto: false,
    ordemGrupo: 2,
  },
  INFRA_OU_CHAMADO: {
    codigo: 'INFRA_OU_CHAMADO',
    label: 'Infra / Chamado Técnico',
    badgeClass: 'badge-diag-infra',
    podeReenviarDireto: false,
    ordemGrupo: 3,
  },
  REENVIAR_NA_ORDEM: {
    codigo: 'REENVIAR_NA_ORDEM',
    label: 'Reenviar na Ordem',
    badgeClass: 'badge-diag-reenviar',
    podeReenviarDireto: true,
    ordemGrupo: 4,
  },
  AGUARDAR_FILA: {
    codigo: 'AGUARDAR_FILA',
    label: 'Aguardar Ciclo / Lote',
    badgeClass: 'badge-diag-aguardar',
    podeReenviarDireto: false,
    ordemGrupo: 5,
  },
};

const ESTAGIOS_TOYOTA = [
  { id: 'RETURN_RETAIL', pattern: /returnretail|devolucao - \[returnretail\]/i, ordem: 'Toyota (Devolução [returnRetail])' },
  { id: 'USADOS', pattern: /saveucarinformation|faturamento de usados/i, ordem: 'Toyota (Faturamento de Usados)' },
  { id: 'BOOKING', pattern: /savewaitinglist|booking/i, ordem: 'Toyota (Booking / Fila)' },
  { id: 'REVALIDACAO', pattern: /savecardrevalidationreceive|ficha redirecionada/i, ordem: 'Toyota (Ficha Redirecionada)' },
  { id: 'ENTRADA_ESTOQUE', pattern: /savereceivevehicle|entrada em estoque/i, ordem: 'Toyota (Entrada em Estoque)' },
  { id: '1_8', pattern: /findallvehicle|plano mensal|stock/i, ordem: 'Toyota 1/8 (Stock)' },
  { id: '2_8', pattern: /show\s*room|fluxo showroom/i, ordem: 'Toyota 2/8 (Fluxo Showroom)' },
  { id: '3_8', pattern: /savecardqualification|qualificacao/i, ordem: 'Toyota 3/8 (Qualificação)' },
  { id: '4_8', pattern: /saveordercloseddeal|negocio fechado/i, ordem: 'Toyota 4/8 (Negócio Fechado)' },
  { id: '5_8', pattern: /saveretailforecast|saveretail\b|previsao de fatura|fatura - \[saveretail/i, ordem: 'Toyota 5/8 (Fatura / Previsão)' },
  { id: '6_8', pattern: /savefirmorder|firm order/i, ordem: 'Toyota 6/8 (Firm Order)' },
  { id: '7_8', pattern: /saveregistration|emplacamento/i, ordem: 'Toyota 7/8 (Emplacamento)' },
  { id: '8_8', pattern: /savedelivery|entrega/i, ordem: 'Toyota 8/8 (Entrega)' },
];

const REGRAS_NDI = [
  {
    id: 'NDI_VENDEDOR_SEM_CPF_EMAIL',
    match: (t) => /cpf.*email.*vendedor|vendedor.*nao cadastrado/i.test(t),
    titulo: 'NDI Nissan — Vendedor sem CPF ou E-mail cadastrado',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: 'NDI 2/3 (Pré-requisito Proposta)',
    causa: 'Usuário vendedor não possui CPF (Pessoa Física vinculada) e/ou e-mail preenchido.',
    passosResolucao:
      '1) Acesse Administração > Segurança > Usuário e o Cadastro de Pessoa vinculado ao vendedor. 2) Preencha CPF e E-mail. 3) Reenvie Proposta (FL008) e NF (NF001) no Monitor.',
  },
  {
    id: 'NDI_CLIENTE_CPF_CNPJ',
    match: (t, st) =>
      ['ERR', 'OUT', 'INC'].includes(st) &&
      (/(?:cpf\/?cnpj|cpf|cnpj).*invalido|cadastro (?:do )?cliente.*validation failed|registro do cadastro do cliente.*nao enviado/i.test(
        t
      ) ||
        /dsinissan cadastro cliente|cadastro cliente/i.test(t)),
    titulo: 'NDI Nissan — Cadastro de Cliente inválido ou pendente de envio',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: 'NDI 1/3 (Cliente/Veículo)',
    causa: 'CPF/CNPJ inválido, pendência cadastral ou cliente ainda não enviado à Nissan bloqueia Proposta (FL008) e NF (NF001).',
    passosResolucao:
      '1) Acesse Cadastro > Pessoas e localize o cliente pelo código da Chave. 2) Corrija CPF/CNPJ e campos obrigatórios. 3) No Monitor, clique em Reenvio da Integração na ordem: Cliente -> Proposta (FL008) -> Nota Fiscal (NF001).',
  },
  {
    id: 'NDI_VEICULO_DM004',
    match: (t) =>
      /ws-dm004|dsinissan cadastro veiculo|cadastro (?:do )?veiculo|inconsistente na ficha gama|nao encontrado no banco de dados nissan/i.test(
        t
      ),
    titulo: 'NDI Nissan — Cadastro de Veículo / Consulta DM004',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: 'NDI 1/3 (Veículo/Cliente)',
    causa: 'Veículo não localizado na base Nissan pelos parâmetros enviados ou inconsistência de EIM do Modelo, Ano Modelo e Cor.',
    passosResolucao:
      '1) Conferir Chassi, EIM do Modelo, Ano Modelo e Cor no cadastro do veículo/modelo. 2) Reenviar primeiro o Cadastro Veículo no Monitor e aguardar status Enviado. 3) Só após Enviado, reenviar Proposta (FL008) e Nota Fiscal (NF001).',
  },
  {
    id: 'NDI_BIR_EMPRESA',
    match: (t) => /codigo bir/i.test(t),
    titulo: 'NDI Nissan — Código BIR não informado na Empresa',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: 'NDI 1/3 (Pré-requisito Empresa)',
    causa: 'Código BIR da montadora ausente no Cadastro de Pessoa vinculado à Empresa da proposta.',
    passosResolucao:
      '1) Preencha o Código BIR no Cadastro de Pessoa da Empresa. 2) Reenvie a integração no Monitor.',
  },
  {
    id: 'NDI_MODELO_NAO_NISSAN_OU_TROCA',
    match: (t) => /cd_modelo_nao_nissan|veiculo da troca sem chassi/i.test(t),
    titulo: 'NDI Nissan — Modelo não Nissan ou Veículo da Troca sem Chassi',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: 'NDI 2/3 (Proposta)',
    causa: 'Falta código CD_MODELO_NAO_NISSAN no cadastro do veículo/modelo ou chassi ausente na avaliação do veículo de troca.',
    passosResolucao:
      '1) Preencha CD_MODELO_NAO_NISSAN no Cadastro de Veículo/Modelo ou o Chassi na Avaliação do usado. 2) Reenvie a Proposta (FL008) e depois a NF (NF001).',
  },
  {
    id: 'NDI_NOTA_FISCAL_NF001',
    match: (t) =>
      /ws-nf001|dsinissan nota(?:s)? fisca(?:l|is)|chave nfe.*devolvida|nota fiscal (?:devolvida|cancelada).*nao enviad|registro da proposta(?: trade in)? do veiculo.*nao enviado/i.test(
        t
      ),
    titulo: 'NDI Nissan — Notas Fiscais Eletrônicas (NF001)',
    acao: 'REENVIAR_NA_ORDEM',
    ordemPrecedencia: 'NDI 3/3 (Nota Fiscal)',
    causa: 'NF pendente ou aguardando que Cliente, Veículo e Proposta (ou NF original em devolução/cancelamento) estejam como Enviado.',
    passosResolucao:
      '1) Confira em Referências Integração se Veículo/Cliente e Proposta (FL008) — ou NF original em devoluções/cancelamentos — já constam como Enviado. 2) Clique em Reenvio da Integração na NF (NF001).',
  },
  {
    id: 'NDI_PROPOSTA_FL008',
    match: (t) => /ws-fl008|registro proposta aceita|proposta.*nao enviado/i.test(t),
    titulo: 'NDI Nissan — Proposta Aceita (FL008)',
    acao: 'REENVIAR_NA_ORDEM',
    ordemPrecedencia: 'NDI 2/3 (Proposta)',
    causa: 'Proposta pendente ou bloqueada aguardando integração prévia de Cliente e Veículo.',
    passosResolucao:
      '1) Verifique em Referências Integração no Monitor se Veículo (DM004) e Cliente estão como Enviado. 2) Reenvie a Proposta (FL008) e, após Enviado, reenvie a Nota Fiscal (NF001).',
  },
  {
    id: 'NDI_RETORNO_CANCELAMENTO_ORFAO',
    match: (t) =>
      /retorno do cancelamento|retorno_ws_01\/05\/2024|outros erros\s+envio_ws_\d{2}\/\d{2}\/\d{4}/i.test(
        t
      ),
    titulo: 'NDI Nissan — Envio / Retorno de Cancelamento sem Chave',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: 'NDI 3/3 (Cancelamento / NF)',
    causa: 'Registro de cancelamento sem referência direta na grid ou cuja NF/Proposta original não foi enviada antes à montadora.',
    passosResolucao:
      '1) Baixe/visualize o XML da linha no Monitor para identificar o documento de origem. 2) Garanta que a NF original esteja Enviada antes de reenviar o cancelamento.',
  },
];

const REGRAS_TOYOTA = [
  {
    id: 'TOYOTA_125_GIVE_UP',
    match: (t) => /\b125\b.*give\s*up|ficha possui give up/i.test(t),
    titulo: 'DSI Toyota (125) — Ficha já possui Give Up',
    acao: 'BLOQUEIO_NEGOCIO',
    ordemPrecedencia: null,
    causa: 'A ficha já teve desistência (Give Up) registrada na Toyota; acompanhamentos, retornos e revalidações posteriores são rejeitados.',
    passosResolucao:
      'Não reenviar no Monitor. Caso o atendimento tenha sido retomado, verificar revalidação ou abertura de nova ficha em Veículo > Atendimento > Atendimento do Vendedor.',
  },
  {
    id: 'TOYOTA_119_PEDIDO_ATIVO',
    match: (t) => /\b119\b.*pedido ativo|ficha possui pedido ativo/i.test(t),
    titulo: 'DSI Toyota (119) — Ficha possui Pedido Ativo',
    acao: 'BLOQUEIO_NEGOCIO',
    ordemPrecedencia: null,
    causa: 'Tentativa de enviar desistência (saveGiveUp) ou cartão retorno para ficha que ainda possui pedido ativo na Toyota.',
    passosResolucao:
      'Não reenviar no Monitor. Se houve desistência real, cancelar/desvincular o pedido ativo antes de enviar a desistência.',
  },
  {
    id: 'TOYOTA_59_PEDIDO_CANCELADO',
    match: (t) => /\b59\b.*pedido cancelado|situacao atual do pedido:\s*canceled/i.test(t),
    titulo: 'DSI Toyota (59) — Pedido já Cancelado (CANCELED)',
    acao: 'BLOQUEIO_NEGOCIO',
    ordemPrecedencia: null,
    causa: 'O pedido consta como CANCELED na montadora; previsões de fatura ou alterações posteriores são recusadas.',
    passosResolucao:
      'Não reenviar no Monitor. Conferir na ficha/proposta em Atendimento do Vendedor se há novo pedido ativo ou encerrar o fluxo.',
  },
  {
    id: 'TOYOTA_361_OUTRO_CONCESSIONARIO',
    match: (t) => /\b361\b.*nao pertence ao concessionario/i.test(t),
    titulo: 'DSI Toyota (361) — Veículo não pertence ao concessionário',
    acao: 'BLOQUEIO_NEGOCIO',
    ordemPrecedencia: null,
    causa: 'O chassi da entrada em estoque (saveReceiveVehicle) está vinculado a outro concessionário/DN na base da Toyota.',
    passosResolucao:
      'Não reenviar no Monitor sem validar a origem. Conferir a NF de entrada/transferência e confirmar titularidade do chassi junto à Toyota.',
  },
  {
    id: 'TOYOTA_144_AVALIACAO_NAO_ENCONTRADA',
    match: (t) => /\b144\b.*avaliacao nao encontrada|unlinkordervaluation/i.test(t),
    titulo: 'DSI Toyota (144) — Avaliação de Usado não encontrada',
    acao: 'BLOQUEIO_NEGOCIO',
    ordemPrecedencia: null,
    causa: 'Avaliação de seminovo não localizada na base da Toyota para a filial/ficha ao tentar desvincular do pedido.',
    passosResolucao:
      'Não reenviar sem conferência. Verificar a avaliação de veículo usado vinculada à ficha e filial em Atendimento do Vendedor.',
  },
  {
    id: 'TOYOTA_2_FICHA_INEXISTENTE',
    match: (t) => /\b2\s*-\s*operacao invalida\s*-\s*ficha inexistente|unlinkcardvaluation/i.test(t),
    titulo: 'DSI Toyota (2) — Ficha inexistente ao desvincular avaliação',
    acao: 'BLOQUEIO_NEGOCIO',
    ordemPrecedencia: null,
    causa: 'Tentativa de desvincular avaliação de ficha que não consta mais na base da Toyota para o Dealer/filial informado.',
    passosResolucao:
      'Não reenviar no Monitor. Conferir a ficha e a avaliação vinculada em Veículo > Atendimento > Atendimento do Vendedor.',
  },
  {
    id: 'TOYOTA_364_REVALIDACAO',
    match: (t) => /\b364\b.*revalidacao/i.test(t),
    titulo: 'DSI Toyota (364) — Ficha já está em revalidação de negócio',
    acao: 'BLOQUEIO_NEGOCIO',
    ordemPrecedencia: null,
    causa: 'A ficha redirecionada já se encontra em processo de revalidação de negócio na Toyota.',
    passosResolucao:
      'Não reenviar repetidamente; acompanhar a situação da ficha em Veículo > Atendimento > Atendimento do Vendedor.',
  },
  {
    id: 'TOYOTA_VEICULO_JA_EM_ESTOQUE',
    match: (t) => /veiculo ja se encontra em estoque/i.test(t),
    titulo: 'DSI Toyota — Veículo já se encontra em estoque',
    acao: 'BLOQUEIO_NEGOCIO',
    ordemPrecedencia: 'Toyota 1/8 (Stock)',
    causa: 'Aviso de faturamento (findAllVehicleInvoiced) de chassi que já deu entrada anteriormente no estoque.',
    passosResolucao:
      'Não é necessário reenviar caso o veículo já conste corretamente em Veículo > Estoque.',
  },
  {
    id: 'TOYOTA_PECA_JA_CONFIRMADA',
    match: (t) => /ja cadastrado e confirmado|recebimento pedido de pecas/i.test(t),
    titulo: 'DSI Toyota — Pedido de Peças já cadastrado e confirmado',
    acao: 'BLOQUEIO_NEGOCIO',
    ordemPrecedencia: null,
    causa: 'O arquivo PDP de pedido de peças já foi importado e confirmado anteriormente no sistema.',
    passosResolucao:
      'Não reenviar no Monitor; validar o pedido diretamente na tela de Compras/Peças.',
  },
  {
    id: 'TOYOTA_9_DATA_INVALIDA',
    match: (t) => /\b9\s*-\s*data invalida|xml_sre.*data invalida/i.test(t),
    titulo: 'DSI Toyota (9) — Data Inválida (Previsão de Emplacamento)',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: 'Toyota 7/8 (Emplacamento)',
    causa: 'Data de previsão de emplacamento (saveRegistration) retroativa ou inconsistente com o faturamento/entrega.',
    passosResolucao:
      '1) Corrija a data em Atendimento do Vendedor ou em Integração > Toyota > Emplacamento/Entrega de Veículo. 2) Reenvie no Monitor após etapas anteriores (1 a 6) estarem Enviadas.',
  },
  {
    id: 'TOYOTA_90_MODELO_COR',
    match: (t) => /\b90\b.*modelo\s*x\s*cor|cor interna nao encontrada/i.test(t),
    titulo: 'DSI Toyota (90) — Modelo x Cor Inválida / Cor Interna',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: 'Toyota 6/8 (Firm Order)',
    causa: 'Divergência entre modelo/cor externa/cor interna do Banco de Pedido e a tabela De/Para esperada pela Toyota.',
    passosResolucao:
      '1) Verifique cores na ficha (Atendimento do Vendedor). 2) Confira Integração > Cadastro > De Para (Tabela: Cor Interna). 3) Localize o código via Fila de Espera, ajuste em Veículo > Estoque > Banco de Pedido e reenvie a Firm Order.',
  },
  {
    id: 'TOYOTA_91_TIPO_FICHA_MIDIA',
    match: (t) => /\b91\b.*tipo de ficha invalido|midia invalida/i.test(t),
    titulo: 'DSI Toyota (91) — Tipo de Ficha / Mídia Inválida',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: 'Toyota 2/8 (Fluxo Showroom)',
    causa: 'A Mídia de Atração da ficha está sem Grupo de Mídia preenchido no cadastro do CRM.',
    passosResolucao:
      '1) Veja a Mídia Atração na ficha em Atendimento do Vendedor. 2) Acesse Cadastro > CRM > Mídia, preencha o Grupo de Mídia e confirme. 3) Reenvie Fluxo Showroom no Monitor.',
  },
  {
    id: 'TOYOTA_547_FK_BANCOPEDIDO',
    match: (t) =>
      /ibancopedidohistorico2|prc_trnveiculohistorico|chassi nao encontrado nos veiculos existentes/i.test(t),
    titulo: 'DSI Toyota (547) — Falha FK BancoPedido / Chassi no Plano Mensal',
    acao: 'INFRA_OU_CHAMADO',
    ordemPrecedencia: 'Toyota 1/8 (Stock / Plano Mensal)',
    causa: 'Conflito de chave estrangeira em dbo.BancoPedido (PRC_TrnVeiculoHistorico) ou chassi/Katashiki ausente ao processar Plano Mensal (findAllVehicle).',
    passosResolucao:
      '1) Conferir Katashiki/Sufixo no modelo mais recente em Cadastro > Veículo > Característica Veículo > Modelo (aba Ano). 2) Reportar código da integração e erro SQL no chamado técnico Dealernet.',
  },
  {
    id: 'TOYOTA_PREPAID_ARQUIVO',
    match: (t) => /pre\s*paid|saveprepaid|erro ao te[n]?tar importar o arquivo/i.test(t),
    titulo: 'DSI Toyota — Erro ao importar Pacote de Revisão (Pre Paid / RV)',
    acao: 'INFRA_OU_CHAMADO',
    ordemPrecedencia: null,
    causa: 'Erro na importação do arquivo de Pacote de Revisão (RV / 7VE*.txt), geralmente por arquivos RV obsoletos no FTP ou versão antiga do Dsi.DealerNet.Setup.',
    passosResolucao:
      '1) Garantir Dsi.DealerNet.Setup >= 4.5.64. 2) Conectar no FTP edi.toyota.com.br (pasta /REC), fazer backup e remover arquivos RV obsoletos por família (RV02COR, RV02HIL, etc.), mantendo os atuais. 3) Conferir Katashiki/Sufixo/Ano no Modelo.',
  },
  {
    id: 'TOYOTA_LOTE_SGMP_POSVENDA',
    match: (t) =>
      /int toyota os aberta|sgmpcarga arquivo|arquivo gerado com sucesso/i.test(t),
    titulo: 'DSI Toyota — Lote Pós-Venda SGMP/HSV aguardando janela',
    acao: 'AGUARDAR_FILA',
    ordemPrecedencia: null,
    causa: 'Arquivos em lote de Pós-Venda (OSR, VRS, REQ, NFP, etc.) gerados e aguardando a transmissão programada (janela das 19h30).',
    passosResolucao:
      'Não reenviar linha a linha no Monitor. Se permanecer travado após a janela, usar Integração > Toyota > Reenviar SGMP/HSV (informando Período e Tipo SGMP ou HSV).',
  },
];

const REGRAS_RENAVE = [
  {
    id: 'RNV_401_CERTIFICADO',
    match: (t) => /\b401\b|unauthorized|vallue cannot be null/i.test(t),
    titulo: 'RENAVE — Falha de Certificado Digital / Autenticação SERPRO (401)',
    acao: 'INFRA_OU_CHAMADO',
    ordemPrecedencia: null,
    causa: 'Certificado Digital tipo Renave vencido, ausente no Credencia Serpro ou empresa não associada ao agendamento SERPRO_RENAVE.',
    passosResolucao:
      '1) Renovar/atualizar o .pfx (renomeado, Tipo: Renave) em Cadastro > NF-e > Certificado Digital > Atualizar Certificado Digital e no portal Credencia Serpro. 2) Validar associação da empresa nos agendamentos de SERPRO_RENAVE.',
  },
  {
    id: 'RNV_CONSULTA_BLOQUEADA',
    match: (t) => /registro de consulta renave nao permitido/i.test(t),
    titulo: 'RENAVE — Consulta Renave não permite reenvio manual',
    acao: 'BLOQUEIO_NEGOCIO',
    ordemPrecedencia: null,
    causa: 'Bloqueio intencional do sistema quando se tenta reenviar Consulta Renave já com status Enviado.',
    passosResolucao:
      'Não reenviar a linha Consulta Renave; reenviar apenas a linha de movimentação correspondente (Entrada, Transferência ou Saída).',
  },
  {
    id: 'RNV_MUNICIPIO',
    match: (t) => /codigo municipio.*invalido|municipio.*renave/i.test(t),
    titulo: 'RENAVE — Código de Município do Comprador Inválido',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: null,
    causa: 'Nome do município no DealerNet diverge do retorno da SERPRO, deixando o código Município Renave vazio.',
    passosResolucao:
      '1) Consultar nome exato no histórico de /api/municipios (Integração > SERPRO). 2) Ajustar em Cadastro > Endereçamento > Município. 3) Executar o agendamento /api/municipios e reenviar a saída no Monitor.',
  },
  {
    id: 'RNV_CARACTERE_INVALIDO',
    match: (t) => /complemento possui caractere invalido|illegal unquoted character|ctrl-char/i.test(t),
    titulo: 'RENAVE — Caractere inválido no Nome ou Complemento do Cliente',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: null,
    causa: 'Campo Complemento ou Nome do comprador possui caractere especial (ex.: *) ou espaço/controle rejeitado pelo SERPRO.',
    passosResolucao:
      '1) Acesse Cadastro > Pessoas, edite o cliente removendo caracteres especiais/espaços indevidos no Complemento e Nome. 2) Clique em Reenvio da Integração no Monitor.',
  },
  {
    id: 'RNV_CPF_RG_EMISSOR',
    match: (t) => /nao e um cpf valido|erro no rg|orgao emissor/i.test(t),
    titulo: 'RENAVE — CPF/RG inválido do usuário emissor da NF',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: null,
    causa: 'Usuário que emitiu/cancelou a NF não possui Pessoa Física com CPF válido ou tem hífen/caractere especial no RG/CPF.',
    passosResolucao:
      '1) Em Administração > Segurança > Usuário, vincular Pessoa Física com CPF válido. 2) Em Cadastro > Pessoas, remover hífens/caracteres especiais de CPF, RG e Órgão Emissor. 3) Reenviar no Monitor.',
  },
  {
    id: 'RNV_AUTORIZACAO_TRANSFERENCIA',
    match: (t) =>
      /ja possui autorizacao de transferencia cadastrada|autorizacao de transferencia para outro estabelecimento/i.test(t),
    titulo: 'RENAVE — Conflito de Autorização de Transferência',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: null,
    causa: 'Autorização de transferência já existente na SERPRO para outro estabelecimento ou pendente na loja de origem.',
    passosResolucao:
      '1) Na loja origem, acesse Veículo > Estoque > RENAVE > Consulta Situação Renave (Chassi + Autorização Transferência). 2) Se CRIADA, clique em Cancelar. 3) Reenvie Autorização/Saída na origem e verifique a Transferência no destino.',
  },
  {
    id: 'RNV_VENDA_DIRETA',
    match: (t) => /venda direta|entregas-veiculo-zero-km/i.test(t),
    titulo: 'RENAVE — Liberação de Entrega Venda Direta',
    acao: 'CORRIGIR_CADASTRO',
    ordemPrecedencia: null,
    causa: 'Registro de Venda Direta gerado sem status ou pendente de liberação para emissão de ATPV.',
    passosResolucao:
      'Acesse Veículo > Estoque > RENAVE > Liberação Entrega Venda Direta e clique em Reenvio.',
  },
];

function inferirOrdemToyota(textoNormalizado) {
  for (const estagio of ESTAGIOS_TOYOTA) {
    if (estagio.pattern.test(textoNormalizado)) {
      return estagio;
    }
  }
  return null;
}

/**
 * Extrai o identificador de negócio útil (Ficha, Cliente, Veículo ou NF) da linha do Monitor.
 *
 * @param {object} reg
 * @returns {string}
 */
export function extrairChaveNegocio(reg) {
  const cols = Array.isArray(reg?.cols) ? reg.cols : [];
  const ignorar = new Set(['envio', 'retorno do envio', 'retorno do cancelamento', 'cancelamento']);
  for (let i = 3; i < Math.min(cols.length, 6); i++) {
    const val = String(cols[i] || '').trim();
    if (!val || val === '0' || /\s/.test(val)) continue;
    const norm = normalizarTexto(val);
    if (ignorar.has(norm)) continue;
    if (/^(erro|outros erros|com inconsistencias|pendente)$/.test(norm)) continue;
    return val;
  }
  return String(reg?.codigo || '').trim();
}

function montarResultadoDiagnostico({
  id,
  titulo,
  acao,
  ordemPrecedencia = null,
  causa,
  passosResolucao,
}) {
  const meta = ACOES_DIAGNOSTICO[acao] || ACOES_DIAGNOSTICO.CORRIGIR_CADASTRO;
  return {
    regraId: id,
    titulo,
    acao: meta.codigo,
    acaoLabel: meta.label,
    badgeClass: meta.badgeClass,
    podeReenviarDireto: meta.podeReenviarDireto,
    ordemGrupo: meta.ordemGrupo,
    ordemPrecedencia,
    causa,
    passosResolucao,
  };
}

/**
 * Classifica uma ocorrência do Monitor DealerNet de acordo com os playbooks oficiais
 * da Central de Ajuda Dealernet para DSI (Toyota), NDI (Nissan) e RENAVE.
 *
 * @param {object} reg
 * @param {{ sistema?: 'DSI' | 'RNV', grupo?: string, statusCode?: string, statusLabel?: string }} [contexto]
 */
export function diagnosticarOcorrencia(reg, contexto = {}) {
  const textoBruto = [reg?.integracao, reg?.detalhes, reg?.raw].filter(Boolean).join(' ');
  const textoNorm = normalizarTexto(textoBruto);
  const statusCode = String(contexto.statusCode || reg?.statusCode || '').toUpperCase();

  const ehRenave =
    contexto.sistema === 'RNV' ||
    /\brnv\b|\brenave\b/i.test(textoNorm);

  if (ehRenave) {
    for (const regra of REGRAS_RENAVE) {
      if (regra.match(textoNorm, statusCode)) {
        return montarResultadoDiagnostico({ ...regra, id: regra.id });
      }
    }

    if (statusCode === 'PEN') {
      return montarResultadoDiagnostico({
        id: 'RNV_PENDENTE_FILA',
        titulo: 'RENAVE — Movimentação Pendente de processamento',
        acao: 'REENVIAR_NA_ORDEM',
        causa: 'Registro aguardando ciclo do agendamento SERPRO_RENAVE.',
        passosResolucao:
          'Aguardar ciclo do agendamento ou clicar em Reenvio da Integração no Monitor (nunca reenviar Consulta Renave se já Enviado).',
      });
    }

    return montarResultadoDiagnostico({
      id: 'RNV_ERRO_INVESTIGAR_HISTORICO',
      titulo: 'RENAVE — Erro sem descrição específica / Consultar Histórico SERPRO',
      acao: 'CORRIGIR_CADASTRO',
      causa: 'Retorno detalhado do SERPRO não exibido diretamente na linha do Monitor.',
      passosResolucao:
        '1) Acesse Integração > Cadastro > Integração > SERPRO_RENAVE > Modifica > Arquivos > Agendamento (ícone Relógio) > Histórico, filtrando Data do erro + 1 dia e Empresa (verificar Msg In). 2) Se envolver nota já integrada, usar Veículo > Estoque > Renave > Cancela Registro no Renave (Saída antes da Entrada).',
    });
  }

  const ehNdi =
    contexto.grupo === 'NDI Nissan' ||
    /ndi\s*nissan|dsinissan/i.test(textoNorm);

  if (ehNdi) {
    for (const regra of REGRAS_NDI) {
      if (regra.match(textoNorm, statusCode)) {
        return montarResultadoDiagnostico({ ...regra, id: regra.id });
      }
    }

    return montarResultadoDiagnostico({
      id: 'NDI_GENERICO',
      titulo: 'NDI Nissan — Verificar dependência (Veículo/Cliente -> Proposta -> NF)',
      acao: statusCode === 'PEN' ? 'REENVIAR_NA_ORDEM' : 'CORRIGIR_CADASTRO',
      ordemPrecedencia: 'NDI (Ordem: Veículo/Cliente -> Proposta -> NF)',
      causa: 'Inconsistência ou pendência na fila de integração NDI Nissan.',
      passosResolucao:
        '1) Verificar a coluna Observação, Referências Integração e XML no Monitor. 2) Regularizar pendência e reenviar sempre na ordem: Veículo/Cliente -> Proposta (FL008) -> Nota Fiscal (NF001).',
    });
  }

  // DSI Toyota (padrão restante para DSI)
  for (const regra of REGRAS_TOYOTA) {
    if (regra.match(textoNorm, statusCode)) {
      return montarResultadoDiagnostico({ ...regra, id: regra.id });
    }
  }

  const estagioToyota = inferirOrdemToyota(textoNorm);
  if (statusCode === 'PEN' || estagioToyota) {
    const sufixoId = estagioToyota ? estagioToyota.id : 'GERAL';
    const ordemLabel = estagioToyota ? estagioToyota.ordem : 'Toyota (Ordem 1 a 8)';
    return montarResultadoDiagnostico({
      id:
        statusCode === 'PEN'
          ? `TOYOTA_PENDENTE_${sufixoId}`
          : `TOYOTA_ERRO_${sufixoId}`,
      titulo:
        statusCode === 'PEN'
          ? `DSI Toyota — Pendência na fila (${ordemLabel})`
          : `DSI Toyota — Erro no fluxo comercial (${ordemLabel})`,
      acao: statusCode === 'PEN' ? 'REENVIAR_NA_ORDEM' : 'CORRIGIR_CADASTRO',
      ordemPrecedencia: ordemLabel,
      causa:
        statusCode === 'PEN'
          ? 'Registro pendente na fila do serviço DSI ou aguardando etapa anterior da mesma Ficha.'
          : 'Erro retornado pela Toyota na interface comercial; requer conferência da Observação/XML antes do reenvio.',
      passosResolucao:
        '1) Conferir Observação e etapas anteriores da mesma Ficha. 2) Reenviar no Monitor respeitando a ordem: 1. Stock -> 2. Showroom -> 3. Qualificação -> 4. Negócio Fechado -> 5. Previsão Fatura/Fatura -> 6. Firm Order -> 7. Emplacamento -> 8. Entrega.',
    });
  }

  return montarResultadoDiagnostico({
    id: 'DSI_GENERICO',
    titulo: 'DSI — Verificar Observação e XML no Monitor',
    acao: 'CORRIGIR_CADASTRO',
    causa: 'Crítica não catalogada especificamente no Monitor DSI.',
    passosResolucao:
      '1) Consultar Observação e baixar o XML da linha no Monitor. 2) Corrigir o dado apontado e reenviar respeitando a ordem de dependência da montadora.',
  });
}

/**
 * Anota o campo `diagnostico` em todos os registros coletados de DSI e RENAVE (sem mutar os originais).
 */
export function anotarDiagnosticos({ resultadosDSI = [], resultadosRenave = [] }) {
  const dsiAnotado = resultadosDSI.map((u) => {
    const novoPorStatus = {};
    for (const [stCode, bloco] of Object.entries(u.porStatus || {})) {
      novoPorStatus[stCode] = {
        ...bloco,
        registros: (bloco.registros || []).map((reg) => ({
          ...reg,
          diagnostico: diagnosticarOcorrencia(reg, {
            sistema: 'DSI',
            grupo: u.grupo,
            statusCode: stCode,
            statusLabel: bloco.label,
          }),
        })),
      };
    }
    return { ...u, porStatus: novoPorStatus };
  });

  const renaveAnotado = resultadosRenave.map((u) => ({
    ...u,
    ocorrencias: (u.ocorrencias || []).map((oc) => ({
      ...oc,
      diagnostico: diagnosticarOcorrencia(oc, {
        sistema: 'RNV',
        statusCode: oc.statusCode,
        statusLabel: oc.statusLabel,
      }),
    })),
  }));

  return { resultadosDSI: dsiAnotado, resultadosRenave: renaveAnotado };
}

/**
 * Consolida todas as ocorrências por regra de diagnóstico para gerar o Playbook de Resolução.
 */
export function gerarPlaybookResumo(resultadosDSI = [], resultadosRenave = []) {
  const grupos = new Map();

  function registrar(sistema, unidadeNome, statusCode, reg) {
    const diag =
      reg.diagnostico ||
      diagnosticarOcorrencia(reg, {
        sistema,
        statusCode,
      });

    if (!grupos.has(diag.regraId)) {
      grupos.set(diag.regraId, {
        ...diag,
        totalOcorrencias: 0,
        unidadesSet: new Set(),
        chavesAmostra: [],
      });
    }

    const g = grupos.get(diag.regraId);
    g.totalOcorrencias++;
    g.unidadesSet.add(unidadeNome);

    const chave = extrairChaveNegocio(reg);
    if (chave && g.chavesAmostra.length < 6 && !g.chavesAmostra.includes(chave)) {
      g.chavesAmostra.push(chave);
    }
  }

  for (const u of resultadosDSI) {
    for (const [stCode, bloco] of Object.entries(u.porStatus || {})) {
      for (const reg of bloco.registros || []) {
        registrar('DSI', u.nome, stCode, {
          ...reg,
          diagnostico:
            reg.diagnostico ||
            diagnosticarOcorrencia(reg, {
              sistema: 'DSI',
              grupo: u.grupo,
              statusCode: stCode,
              statusLabel: bloco.label,
            }),
        });
      }
    }
  }

  for (const u of resultadosRenave) {
    for (const oc of u.ocorrencias || []) {
      registrar('RNV', u.nome, oc.statusCode, oc);
    }
  }

  return Array.from(grupos.values())
    .map((g) => ({
      regraId: g.regraId,
      titulo: g.titulo,
      acao: g.acao,
      acaoLabel: g.acaoLabel,
      badgeClass: g.badgeClass,
      podeReenviarDireto: g.podeReenviarDireto,
      ordemGrupo: g.ordemGrupo,
      ordemPrecedencia: g.ordemPrecedencia,
      causa: g.causa,
      passosResolucao: g.passosResolucao,
      totalOcorrencias: g.totalOcorrencias,
      unidades: Array.from(g.unidadesSet),
      chavesAmostra: g.chavesAmostra,
    }))
    .sort((a, b) => a.ordemGrupo - b.ordemGrupo || b.totalOcorrencias - a.totalOcorrencias);
}
