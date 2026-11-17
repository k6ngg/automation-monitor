import path from 'node:path';
import nodemailer from 'nodemailer';

/**
 * Valida se as credenciais mínimas do Zoho Mail SMTP estão presentes quando o envio está ativo.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function validarConfigEmail(env = process.env) {
  if (env.EMAIL_ENABLED !== 'true') return;
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error(
      'EMAIL_ENABLED=true requer SMTP_USER e SMTP_PASS configurados no arquivo .env.'
    );
  }
}

/**
 * Monta as configurações padrão para Zoho Mail SMTP (porta 465 SSL ou 587 STARTTLS).
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function obterConfigSmtpZoho(env = process.env) {
  const host = env.SMTP_HOST || 'smtp.zoho.com';
  const port = Number(env.SMTP_PORT || 465);
  const secure =
    env.SMTP_SECURE !== undefined && env.SMTP_SECURE !== ''
      ? env.SMTP_SECURE === 'true'
      : port === 465;

  return {
    host,
    port,
    secure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  };
}

/**
 * Monta o assunto do e-mail refletindo a situação consolidada da execução.
 */
export function montarAssuntoEmail(periodo, resumo, comparacao) {
  const partes = [`[DealerNet] Monitor de Integrações (${periodo.dataHojePrefixo})`];

  if (resumo.totalFalhas > 0) {
    partes.push(`Falha parcial (${resumo.totalFalhas} unidade(s))`);
  } else if (resumo.totalOcorrencias > 0) {
    partes.push(`${resumo.totalOcorrencias} ocorrência(s)`);
  } else {
    partes.push('Tudo OK');
  }

  if (comparacao?.temComparacao && comparacao.totalNovas > 0) {
    partes.push(`+${comparacao.totalNovas} nova(s)`);
  }

  return partes.join(' — ');
}

/**
 * Envia o relatório gerado via Zoho Mail SMTP com o PDF anexado.
 */
export async function enviarRelatorioPorEmail({
  env = process.env,
  periodo,
  resumo,
  comparacao = null,
  textoChamado,
  htmlRelatorio,
  caminhoPdf,
  logger,
  transporterCustom = null,
}) {
  if (env.EMAIL_ENABLED !== 'true') {
    return { enviado: false, motivo: 'desativado' };
  }

  if (
    env.EMAIL_ONLY_ON_ISSUES === 'true' &&
    resumo.totalOcorrencias === 0 &&
    resumo.totalFalhas === 0
  ) {
    logger?.info?.('-> E-mail não enviado (EMAIL_ONLY_ON_ISSUES=true e sem ocorrências).');
    return { enviado: false, motivo: 'sem_ocorrencias' };
  }

  validarConfigEmail(env);

  const smtpConfig = obterConfigSmtpZoho(env);
  const transporter = transporterCustom || nodemailer.createTransport(smtpConfig);
  const assunto = montarAssuntoEmail(periodo, resumo, comparacao);
  const destinatario = env.EMAIL_TO || env.SMTP_USER;

  const mailOptions = {
    from: env.EMAIL_FROM || env.SMTP_USER,
    to: destinatario,
    ...(env.EMAIL_CC ? { cc: env.EMAIL_CC } : {}),
    subject: assunto,
    text: textoChamado,
    html: htmlRelatorio,
    attachments: caminhoPdf
      ? [{ filename: path.basename(caminhoPdf), path: caminhoPdf }]
      : [],
  };

  logger?.info?.(`-> Enviando relatório por e-mail (${smtpConfig.host}:${smtpConfig.port}) para ${destinatario}...`);
  const info = await transporter.sendMail(mailOptions);
  logger?.info?.(`-> E-mail enviado com sucesso (ID: ${info?.messageId || 'ok'}).`);

  return {
    enviado: true,
    destinatario,
    assunto,
    messageId: info?.messageId || null,
  };
}
