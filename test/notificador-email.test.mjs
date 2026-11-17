import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enviarRelatorioPorEmail,
  obterConfigSmtpZoho,
  validarConfigEmail,
} from '../src/notificador-email.mjs';

const periodoMock = { dataHojePrefixo: '17/11/2026' };

test('obterConfigSmtpZoho usa smtp.zoho.com:465 SSL por padrão e ajusta porta 587', () => {
  const padrao = obterConfigSmtpZoho({ SMTP_USER: 'a@b.com', SMTP_PASS: '123' });
  assert.equal(padrao.host, 'smtp.zoho.com');
  assert.equal(padrao.port, 465);
  assert.equal(padrao.secure, true);

  const starttls = obterConfigSmtpZoho({
    SMTP_PORT: '587',
    SMTP_USER: 'a@b.com',
    SMTP_PASS: '123',
  });
  assert.equal(starttls.port, 587);
  assert.equal(starttls.secure, false);
});

test('validarConfigEmail falha quando EMAIL_ENABLED=true sem credenciais', () => {
  assert.doesNotThrow(() => validarConfigEmail({ EMAIL_ENABLED: 'false' }));
  assert.throws(() => validarConfigEmail({ EMAIL_ENABLED: 'true', SMTP_USER: 'a@b.com' }), /SMTP_PASS/);
});

test('enviarRelatorioPorEmail respeita flags EMAIL_ENABLED e EMAIL_ONLY_ON_ISSUES', async () => {
  let enviadoCount = 0;
  const transporterFake = {
    async sendMail() {
      enviadoCount++;
      return { messageId: 'msg-1' };
    },
  };

  const r1 = await enviarRelatorioPorEmail({
    env: { EMAIL_ENABLED: 'false' },
    periodo: periodoMock,
    resumo: { totalOcorrencias: 3, totalFalhas: 0 },
    transporterCustom: transporterFake,
  });
  assert.equal(r1.enviado, false);
  assert.equal(r1.motivo, 'desativado');

  const r2 = await enviarRelatorioPorEmail({
    env: {
      EMAIL_ENABLED: 'true',
      EMAIL_ONLY_ON_ISSUES: 'true',
      SMTP_USER: 'a@b.com',
      SMTP_PASS: 'secret',
    },
    periodo: periodoMock,
    resumo: { totalOcorrencias: 0, totalFalhas: 0 },
    transporterCustom: transporterFake,
  });
  assert.equal(r2.enviado, false);
  assert.equal(r2.motivo, 'sem_ocorrencias');
  assert.equal(enviadoCount, 0);
});

test('enviarRelatorioPorEmail monta mensagem com PDF anexo e fallback de EMAIL_TO para SMTP_USER', async () => {
  const mensagens = [];
  const transporterFake = {
    async sendMail(opts) {
      mensagens.push(opts);
      return { messageId: 'zoho-123' };
    },
  };

  const res = await enviarRelatorioPorEmail({
    env: {
      EMAIL_ENABLED: 'true',
      SMTP_USER: 'monitor@empresa.com.br',
      SMTP_PASS: 'app-pass',
      EMAIL_CC: 'equipe@empresa.com.br',
    },
    periodo: periodoMock,
    resumo: { totalOcorrencias: 2, totalFalhas: 0 },
    comparacao: { temComparacao: true, totalNovas: 1 },
    textoChamado: 'Resumo TXT',
    htmlRelatorio: '<p>Resumo HTML</p>',
    caminhoPdf: '/tmp/relatorio-2026-11-17_15-30.pdf',
    transporterCustom: transporterFake,
  });

  assert.equal(res.enviado, true);
  assert.equal(mensagens.length, 1);
  assert.equal(mensagens[0].from, 'monitor@empresa.com.br');
  assert.equal(mensagens[0].to, 'monitor@empresa.com.br');
  assert.equal(mensagens[0].cc, 'equipe@empresa.com.br');
  assert.match(mensagens[0].subject, /2 ocorrência\(s\) — \+1 nova\(s\)/);
  assert.equal(mensagens[0].attachments[0].filename, 'relatorio-2026-11-17_15-30.pdf');
});
