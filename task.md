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

**✅ ENDURECIMENTO PARA PRODUÇÃO — revisão de segurança/robustez (testado):**
- [x] 🔒 Access Token NUNCA vai para o navegador: `accounts.list()` devolve `has_token`
      (0/1), não o token. Frontend usa `has_token`. Token guardado só no servidor.
- [x] 📞 `normalizePhone` reconcilia formatos BR (`(11) 9…`, `+55 11 9…`, `5511…`) →
      mesmo número → NÃO duplica contato. (Números do webhook já vêm completos.)
- [x] 📵 Upload de mídia validado no SERVIDOR (não confia no front): só mimes aceitos
      pela Meta + teto de 20 MB. Upload registrado na auditoria.
- [x] 📋 Tela de Auditoria (admin) na aba Templates: quem fez o quê (envio, atribuição,
      conta, upload…). Backend já registrava; agora tem visualização.
- [x] Banco: índices completos (phone, wamid, conversas, webhook_events…), idempotência
      por wamid, escrita atômica, flush no shutdown. Webhook valida assinatura HMAC-SHA256
      (timing-safe). API com timeout (30s/60s) e SEM retry (evita mensagem duplicada).
- Testado: token não vaza, dedup dos 3 formatos → 1 contato, upload .exe bloqueado (400)
  e PNG aceito (200), auditoria abre. Regressão: 12 módulos antigos + WhatsApp ok, 403 p/ sem permissão.

**✅ MULTI-CONTA / MULTI-NÚMERO — vários números oficiais, isolados por funcionário (testado):**
- [x] Banco: conexão ganha responsável (login+nome), ativo, last_error + migração p/ bancos antigos.
      conversations.list/count aceitam account_ids (contas que o usuário pode ver).
- [x] Backend: funcionário comum vê SÓ as conversas das contas em que é responsável; admin vê tudo.
      Blindagem: abrir/enviar/agir em conversa de outra conta → 403 (guarda no /conversations/<id> + no send).
      Enviar só pela conta permitida (garante o número certo). Rotas de conta (criar/editar/ativar/
      vincular responsável) só admin. GET /accounts: comum vê só as suas; token nunca vai (has_token).
      Editar sem preencher token NÃO apaga o token salvo.
- [x] Frontend: aba "Conexões" (admin) — cards com nome/número/API Oficial/responsável/status/ativa/
      última sync/erro; criar/editar/testar/ativar-desativar/vincular funcionário. Inbox com seletor de
      conta ("Todas as contas" / cada número) e "via <número>" no cabeçalho do chat.
- Testado: admin cria 2 conexões (A→carlos, B→pedro); carlos vê só a conta A e leva 403 ao abrir/enviar
  na conta B; pedro só a conta B; admin vê as 2; carlos não vê a aba Conexões. Regressão ok.

## 100% API OFICIAL DA META. Nada de QR Code / WhatsApp Web / bibliotecas não oficiais.

## Depende de credenciais reais da Meta (não fornecidas ainda)
- Envio/recebimento real de mensagens, sync de templates, status de entrega/leitura.
- Configurar no `.env`: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` (globais) +
  por conta no painel: phone_number_id, waba_id, access_token.

## Como continuar
Backend está sólido. O próximo passo é o FRONTEND (`js/whatsapp.js` + seção no index.html +
permissões), depois responsividade mobile e a documentação de deploy.
