/**
 * Configuração das Unidades, Status e Regras de Negócio para o Monitor DealerNet
 * Extraído diretamente do DOM de wwmonitorsistema.aspx
 */

export const STATUS_ALVO = [
  { code: 'ERR', label: 'Erro' },
  { code: 'OUT', label: 'Outros Erros' },
  { code: 'INC', label: 'Com Inconsistencias' },
  { code: 'PEN', label: 'Pendente' },
];

// Unidades verificadas em Sistema = DSI (NDI Nissan + DSI Toyota)
// Excluídas conforme orientação: JADE - IRC, JADE MOTOS, JADE-DESATIVADA, TOPÁZIO JQE, TOPÁZIO PAF, TOPAZIO SEMI
export const UNIDADES_DSI = [
  // Grupo Jade (NDI Nissan)
  { code: '4',  nome: 'JADE - ITB',        grupo: 'NDI Nissan' },
  { code: '1',  nome: 'JADE - MATRIZ',     grupo: 'NDI Nissan' },
  { code: '22', nome: 'JADE - TXF',        grupo: 'NDI Nissan' },
  { code: '9',  nome: 'JADE - VDC',        grupo: 'NDI Nissan' },

  // Grupo Topázio (DSI Toyota)
  { code: '18', nome: 'TOPÁZIO – EUN',     grupo: 'DSI Toyota' },
  { code: '16', nome: 'TOPÁZIO – IRC',     grupo: 'DSI Toyota' },
  { code: '13', nome: 'TOPÁZIO – ITB',     grupo: 'DSI Toyota' },
  { code: '12', nome: 'TOPAZIO MATRIZ',    grupo: 'DSI Toyota' },
  { code: '14', nome: 'TOPÁZIO – TXF',     grupo: 'DSI Toyota' },
];

// Todas as unidades ativas verificadas em Sistema = Renave (RNV)
export const UNIDADES_RENAVE = [
  { code: '19', nome: 'CRISTAL - ITB' },
  { code: '20', nome: 'CRISTAL - TXF' },
  { code: '32', nome: 'DIAMANTE IRC' },
  { code: '31', nome: 'DIAMANTE MATRIZ' },
  { code: '25', nome: 'JADE - IRC' },
  { code: '4',  nome: 'JADE - ITB' },
  { code: '1',  nome: 'JADE - MATRIZ' },
  { code: '22', nome: 'JADE - TXF' },
  { code: '9',  nome: 'JADE - VDC' },
  { code: '28', nome: 'JADE MOTOS - FSA' },
  { code: '26', nome: 'JADE MOTOS - MATRIZ' },
  { code: '27', nome: 'JADE MOTOS - VDC' },
  { code: '8',  nome: 'RUBI - EUN' },
  { code: '6',  nome: 'RUBI - MATRIZ' },
  { code: '21', nome: 'RUBI - PTL' },
  { code: '29', nome: 'RUBI ASIA - MATRIZ' },
  { code: '30', nome: 'RUBI ASIA - PTL' },
  { code: '11', nome: 'SAPHIR - MATRIZ' },
  { code: '18', nome: 'TOPÁZIO – EUN' },
  { code: '16', nome: 'TOPÁZIO – IRC' },
  { code: '13', nome: 'TOPÁZIO – ITB' },
  { code: '15', nome: 'TOPÁZIO – JQE' },
  { code: '12', nome: 'TOPAZIO MATRIZ' },
  { code: '17', nome: 'TOPÁZIO – PAF' },
  { code: '23', nome: 'TOPAZIO – SEMI' },
  { code: '14', nome: 'TOPÁZIO – TXF' },
  { code: '24', nome: 'T-SERVICE - FSA' },
];

// Ordem de reenvio exigida no chamado para DSI Toyota (apenas referência no relatório)
export const ORDEM_REENVIO_TOYOTA = [
  '1. Stock - Estoque [findAllVehicleInvoiced / findAllVehicle]',
  '2. Fluxo Showroom',
  '3. Negociação / Qualificação [saveCardQualification]',
  '4. Negócio Fechado [saveOrderClosedDeal]',
  '5. Previsão de Fatura [saveRetailForecast] / Fatura [saveRetail]',
  '6. Firm Order',
  '7. Previsão de Entrega / Emplacamento [saveRegistration]',
  '8. Entrega [saveDelivery]',
];
