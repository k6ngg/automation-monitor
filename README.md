# Verificador de Integrações DealerNet (DSI/NDI & Renave)

Automação **100% somente leitura** em Playwright para verificar os monitores de integração do DealerNet (`Integração > Cadastro > Monitor`) do 1º dia do mês atual até a data atual.

## Como funciona

1. Faz login no portal DealerNet usando as credenciais do arquivo `.env`.
2. Abre `Integração > Cadastro > Monitor` (`wwmonitorsistema.aspx`).
3. Filtra sempre do **dia 01 do mês atual (`00:00`) até a data atual (`23:59`)**.
4. Verifica os 4 status: **Erro (`ERR`)**, **Outros Erros (`OUT`)**, **Com Inconsistências (`INC`)** e **Pendente (`PEN`)**:
   - **DSI (`Sistema = DSI`)**
   - **Renave (`Sistema = RNV`)**: todas as unidades ativas.
5. Aplica automaticamente a regra do chamado para a Nissan: **despreza erros da Ficha GAMA quando a data do erro for o dia atual**.
6. Salva na pasta `./relatorios/`:
   - `relatorio-AAAA-MM-DD_HH-mm.pdf`: relatório completo em **PDF** (A4 paisagem, com tabelas coloridas por status e paginação).
   - `relatorio-AAAA-MM-DD_HH-mm.md`: versão em Markdown.
   - `chamado-AAAA-MM-DD_HH-mm.txt`: resumo pronto para copiar e colar no chamado recorrente.

## Como rodar

*(O Chromium do Playwright já está instalado na sua máquina).*

```bash
cd /home/leonardo/.gemini/antigravity/scratch/dealernet-monitor

# Rodar em segundo plano (headless) e gerar o PDF em ./relatorios/
npm start

# Ou rodar vendo o navegador abrir na tela (também gera o PDF ao final):
npm run visivel
```

## Onde alterar configurações

- [.env](file:///home/leonardo/.gemini/antigravity/scratch/dealernet-monitor/.env): usuário, senha, modo `HEADLESS` e limite de páginas por status.
- [config.mjs](file:///home/leonardo/.gemini/antigravity/scratch/dealernet-monitor/config.mjs): lista de unidades DSI, unidades Renave e status verificados.
- [verificar-integracoes.mjs](file:///home/leonardo/.gemini/antigravity/scratch/dealernet-monitor/verificar-integracoes.mjs): script principal (somente leitura).
