# Verificador de Integrações DealerNet (DSI/NDI & Renave)

Automação **100% somente leitura** em Playwright para verificar os monitores de integração do DealerNet (`Integração > Cadastro > Monitor`) do 1º dia do mês atual até a data atual.

## Como funciona

1. Faz login no portal DealerNet usando as credenciais do arquivo `.env`.
2. Abre `Integração > Cadastro > Monitor` (`wwmonitorsistema.aspx`).
3. Filtra sempre do **dia 01 do mês atual (`00:00`) até a data atual (`23:59`)**.
4. Verifica os 4 status: **Erro (`ERR`)**, **Outros Erros (`OUT`)**, **Com Inconsistências (`INC`)** e **Pendente (`PEN`)**:
   - **DSI (`Sistema = DSI`)**: unidades NDI Nissan (JADE) e DSI Toyota (Topázio).
   - **Renave (`Sistema = RNV`)**: todas as unidades ativas.
5. Aplica automaticamente a regra da Nissan: **despreza erros da Ficha GAMA nas unidades JADE quando a data do registro for o dia atual**.
6. Compara com a última execução (`relatorios/.ultimo-snapshot.json`) para destacar ocorrências **Novas**, **Persistentes** e **Resolvidas**.
7. Classifica automaticamente cada ocorrência (**NDI Nissan**, **DSI Toyota** e **RENAVE**) segundo os procedimentos da Central de Ajuda Dealernet, indicando se é elegível para reenvio ordenado, ajuste cadastral, chamado técnico ou bloqueio de negócio (não reenviar), gerando um **Plano de Ação e Resolução Consolidado**.
8. Isola falhas por unidade (salva evidência em `relatorios/erros/` e continua verificando as demais unidades, exibindo alerta no relatório caso alguma falhe).
9. Salva na pasta `./relatorios/`:
   - `relatorio-AAAA-MM-DD_HH-mm.pdf`: relatório completo em **PDF** (A4 paisagem, com tabelas coloridas por status, coluna de diagnóstico e paginação).
   - `relatorio-AAAA-MM-DD_HH-mm.md`: versão em Markdown.
   - `chamado-AAAA-MM-DD_HH-mm.txt`: resumo pronto para copiar e colar no chamado recorrente.
   - `execucao-AAAA-MM-DD_HH-mm.log`: log detalhado da execução.
10. *(Opcional)* Envia o resumo e o PDF em anexo por e-mail via **Zoho Mail SMTP**.

## Instalação

Requer **Node.js `>= 20`**. No openSUSE Tumbleweed:

```bash
sudo zypper install nodejs-default npm-default
npm ci
npm run setup
```

Crie o arquivo `.env` a partir do modelo:

```bash
cp .env.example .env
```

Preencha `DEALERNET_URL`, `DEALERNET_USER` e `DEALERNET_PASS` no `.env`.

## Como rodar

```bash
# Rodar em segundo plano (headless) e gerar relatórios em ./relatorios/
npm start

# Ou rodar vendo o navegador abrir na tela (também gera o PDF ao final):
npm run visivel

# Executar verificação de sintaxe e testes unitários:
npm run check
```

*(Também é possível executar diretamente com `node verificar-integracoes.mjs`.)*

## Envio por e-mail (Zoho Mail SMTP)

Para habilitar o envio automático do relatório com o PDF em anexo, ajuste no `.env`:

```env
EMAIL_ENABLED=true
EMAIL_ONLY_ON_ISSUES=false
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=seu.email@seudominio.com.br
SMTP_PASS=sua_senha_ou_senha_de_app
EMAIL_TO=destinatario@seudominio.com.br
```

- Se `EMAIL_TO` ficar vazio, o envio é feito por padrão para o próprio `SMTP_USER`.
- Caso sua conta Zoho utilize autenticação em dois fatores (2FA), gere uma **Senha de Aplicativo** nas configurações de segurança do Zoho Mail e use-a em `SMTP_PASS`.
- Caso seu domínio Zoho esteja hospedado na região Europa ou Índia, ajuste `SMTP_HOST` (ex.: `smtp.zoho.eu`).

## Códigos de saída

- `0`: concluído sem ocorrências e sem falhas de coleta.
- `2`: concluído com ocorrências pendentes ou com erro a verificar.
- `3`: concluído, porém uma ou mais unidades falharam durante a coleta.
- `1`: erro fatal (configuração ausente, falha de login/navegador ou erro ao enviar e-mail).

## Arquivos principais

- `.env`: credenciais, limites de paginação e configuração de e-mail (não versionado).
- [config.mjs](file:///home/lcerqueira/automation-monitor/config.mjs): lista de unidades DSI, unidades Renave e status verificados.
- [src/](file:///home/lcerqueira/automation-monitor/src/): módulos da automação, regras de negócio, comparação, relatórios e notificador.
- [verificar-integracoes.mjs](file:///home/lcerqueira/automation-monitor/verificar-integracoes.mjs): ponto de entrada compatível.
