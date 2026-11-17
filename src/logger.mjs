import fs from 'node:fs';
import path from 'node:path';

/**
 * Cria um logger simples que escreve no console e em arquivo de log por execução.
 *
 * @param {string} caminhoArquivoLog
 */
export function criarLogger(caminhoArquivoLog) {
  fs.mkdirSync(path.dirname(caminhoArquivoLog), { recursive: true });

  function gravar(nivel, mensagem) {
    const agora = new Date().toISOString();
    const linha = `[${agora}] [${nivel}] ${mensagem}\n`;
    try {
      fs.appendFileSync(caminhoArquivoLog, linha, 'utf8');
    } catch {
      // Evita interromper a automação caso não seja possível gravar o log em disco
    }
  }

  return {
    caminho: caminhoArquivoLog,
    info(mensagem) {
      console.log(mensagem);
      gravar('INFO', mensagem);
    },
    warn(mensagem) {
      console.warn(mensagem);
      gravar('WARN', mensagem);
    },
    error(mensagem, err) {
      const detalhe = err ? `${mensagem} | ${err.stack || err.message || err}` : mensagem;
      console.error(mensagem);
      gravar('ERROR', detalhe);
    },
  };
}
