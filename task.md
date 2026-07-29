# Módulo WhatsApp — Acompanhamento (task.md)

Sistema: R&T VAGAS IA / Vende RT. API oficial WhatsApp Cloud API (Meta).
Banco isolado em `DATA_DIR/whatsapp.db` (sql.js) — separado do `state.json`.

## Estado atual (auditoria em 2026-07-29)

### ✅ Pronto e TESTADO (backend)
- [x] `whatsapp-db.cjs` (739 linhas) — camada SQLite via sql.js. Tabelas: accounts,
      contacts, conversations, messages, templates, tags, webhookEvents, audit.
- [x] `whatsapp-api.cjs` (526) — cliente da Meta (texto, mídia, template, phone info, templates).
- [x] `whatsapp-webhook.cjs` (393) — verificação GET, validação de assinatura, processEvent idempotente.
- [x] `server.cjs` — rotas `/api/whatsapp/*` + `/webhooks/whatsapp` (513 linhas ADICIONADAS, 0 removidas).
      Reusa auth existente (sessaoValida/ehMestreLogin) + permissão `whatsapp`.
- [x] `.env.example`, `.gitignore` (ignora `.env`, `*.db`), `package.json` (sql.js; better-sqlite3 removido).
- [x] SSE `/api/whatsapp/events` para tempo real.
- [x] Persistência sql.js: debounce 500ms + escrita atômica (tmp+rename). **Testado: persiste no restart.**
- [x] **Correção aplicada:** flush do banco no SIGINT/SIGTERM (não perde escrita no restart do PM2).

Testes feitos: boot OK; login existente OK; dashboard 401 sem login / 200 com admin;
webhook GET ecoa challenge (token certo) / 403 (errado); contato criado persiste após restart.

### ⚠️ Pendências técnicas (a decidir com o dono)
- [ ] Access Token guardado em texto no `.db` (campo `access_token_enc` — nome sugere cripto, mas é plano).
      Recomendado: cifrar em repouso com chave em `.env`. **Explicar antes de mudar.**
- [ ] `PRAGMA journal_mode=WAL` é inócuo no sql.js (em memória) — pode remover, sem urgência.

### Frontend — progresso por etapas
**✅ ETAPA 1 (FUNDAÇÃO) — pronta e testada:**
- [x] Permissão `whatsapp` no grid de funcionários (add em AREAS_SISTEMA → gera a linha + salva).
- [x] Item "WhatsApp" na sidebar (id nav-item-whatsapp) — aparece SÓ para quem tem permissão.
- [x] `isAbaAutorizada('whatsapp')`, iconMap, titleMap, roteamento em renderCurrentAba.
- [x] Seção `aba-whatsapp` no index.html (header + sub-abas + container).
- [x] `js/whatsapp.js` (novo) — helpers de API/permissão, sub-abas, **Dashboard (8 cartões)**.
- [x] `css/whatsapp.css` (novo).
- [x] `js/whatsapp.js` protegido no server.cjs (404 sem login) + carregado no index.html.
- Testado no navegador: admin vê e abre (dashboard renderiza); maria (sem permissão) NÃO vê;
  Fluxo Financeiro/Equipamentos seguem funcionando; sem erro de JS.

**✅ ETAPA 2 (CONTATOS) — pronta e testada:**
- [x] Listar, buscar (debounce), criar, editar, ver detalhes. Modal reutilizável (_waModal).
- [x] SEM duplicar por telefone (backend dedup por phone). Telefone travado na edição.
- [x] Correção: guarda anti-corrida (troca de sub-aba durante fetch não sobrescreve a tela).
- Testado: criar/dedup/busca/editar (persistiu no banco)/ver — tudo ok, sem erro de JS.

**✅ ETAPA 3 (INBOX) — pronta e testada:**
- [x] 3 colunas (lista de conversas | chat | info do contato). Filtros (todas/abertas/não lidas/fechadas) + busca.
- [x] Abrir conversa carrega mensagens; bolhas in/out estilo WhatsApp + status (✓/✓✓/lida/falhou).
- [x] Enviar texto e mídia (upload → /media/upload → envio). Falha graciosa sem token da Meta.
- [x] Notas internas (destaque amarelo, NUNCA vão pro WhatsApp — is_internal_note no banco).
- [x] Atribuir atendente, fechar, reabrir conversa. Badge de não-lidas no menu.
- [x] SSE em tempo real: mensagem nova aparece sozinha (testado webhook→SSE, 1→2 sem reload).
- Testado com webhook simulado (formato Meta): cria conversa/contato/mensagem, idempotente.

**✅ ETAPA 4 (TEMPLATES) — pronta e testada:**
- [x] Aba Templates: lista (nome/idioma/categoria/status com selo colorido).
- [x] Sincronizar templates com a Meta (admin) — falha graciosa sem token.
- [x] Conexão com a Meta (admin): criar/editar conta (Phone Number ID, WABA, Access
      Token — token só no servidor), testar conexão.
- [x] Picker no chat oferece SÓ templates APROVADOS; envio de não-aprovado bloqueado.
- Testado: aba/empty, criar conexão (conta no banco), sync gracioso, picker só aprovados.

**✅ ETAPA 5 (MOBILE + DEPLOY) — pronta e testada:**
- [x] Inbox mobile: 1 coluna (lista → chat → voltar), botão de info do contato,
      campo de mensagem acessível, SEM overflow horizontal. Desktop intacto.
- [x] Dashboard/contatos/templates responsivos (cards e tabelas com scroll interno).
- [x] server.cjs: carrega `.env` automaticamente (loader zero-dependência).
- [x] `docs/WHATSAPP-DEPLOY.md`: guia completo (npm, .env, Meta, número, webhook,
      Nginx c/ SSE, SSL/Certbot, PM2, restart, update, backup, restore, logs, erros).
- Testado no navegador (viewport 390px): lista→chat→voltar, sem overflow, msg acessível.

## MÓDULO WHATSAPP COMPLETO ✅ (5 etapas). Falta só: credenciais reais da Meta + deploy.

## Depende de credenciais reais da Meta (não fornecidas ainda)
- Envio/recebimento real de mensagens, sync de templates, status de entrega/leitura.
- Configurar no `.env`: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` (globais) +
  por conta no painel: phone_number_id, waba_id, access_token.

## Como continuar
Backend está sólido. O próximo passo é o FRONTEND (`js/whatsapp.js` + seção no index.html +
permissões), depois responsividade mobile e a documentação de deploy.
