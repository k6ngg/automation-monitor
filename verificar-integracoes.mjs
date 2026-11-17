/**
 * ============================================================================
 * VERIFICADOR SOMENTE-LEITURA DE INTEGRAÇÕES DEALERNET (DSI/NDI & RENAVE)
 * ============================================================================
 * Ponto de entrada principal (mantido para compatibilidade com execução direta).
 * A lógica modularizada reside em ./src/.
 * ============================================================================
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './src/index.mjs';

export { obterPeriodoMesAtual } from './src/periodo.mjs';
export {
  gerarRelatorioHtml,
  gerarRelatorioMarkdown,
  gerarResumoChamadoTxt,
  salvarHtmlComoPdf,
} from './src/relatorios.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Erro fatal na execução:', err);
    process.exit(1);
  });
}
