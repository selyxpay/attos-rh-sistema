# R&T VAGAS IA — Acompanhamento

Sistema: R&T VAGAS IA / Vende RT (Grupo R&T).
Servidor Node (`server.cjs`) + estado em JSON + uploads em disco. WhatsApp
oficial (Meta Cloud API) com banco isolado em `DATA_DIR/whatsapp.db` (sql.js).

---

## Estabilização (auditoria de 2026-08-01)

### Equipamentos — corrigido e blindado
- [x] **Lista aparecia vazia** (só os números): corrigido. Cada linha é montada
      isolada (um registro com formato antigo não derruba a lista), o filtro que
      esconde tudo agora avisa e oferece "Limpar filtros e mostrar tudo", e
      qualquer falha geral mostra que os registros continuam salvos.
- [x] **Foto no celular não anexava**: aceita HEIC/HEIF (iPhone) e foto de câmera
      sem extensão (vale o tipo real). Executável disfarçado continua bloqueado.
- [x] **Celular**: lista vira cards (`.equip-mobile-view`); desktop segue tabela.
      Testado em 320/360/375/390/414/430px sem rolagem lateral.
- [x] **Guarda anti-sumiço** (`equipamentos-protecao.cjs`): save sem a lista
      preserva; save que apagaria vários registros de uma vez devolve tudo;
      exclusão de 1 registro continua funcionando e fica arquivada.
- [x] **Espelho independente** em `DATA_DIR/equipamentos/` + 30 snapshots.
- [x] **`restaurar-equipamentos.cjs`**: confere por padrão, restaura com
      `--aplicar` (com backup antes), aceita `--de-snapshot`.
- [x] Documentação: `docs/EQUIPAMENTOS-PROTECAO.md`.

### WhatsApp
- [x] **Isolamento**: falha do módulo (ex.: sql.js ausente) não derruba mais o
      sistema — o servidor sobe e só o WhatsApp responde 503.
- [x] **Access Token cifrado em repouso** (AES-256-GCM) com `WHATSAPP_CRYPTO_KEY`.
      Compatível com token antigo em texto puro e com a chave ausente.
- [x] Multi-conta isolada por responsável (testado: 403 cruzado, admin vê tudo).
- [x] Token nunca vai ao navegador (`accounts.list()` só informa `has_token`).
- [x] Webhook com assinatura HMAC-SHA256 timing-safe e idempotência por `wamid`.

### Limpeza
- [x] Removidos: `js/firebase-sync.js` (código morto, continha credenciais do
      projeto Firebase "vagasrt"), `firebase.json`, `.firebaserc`,
      `firebase-setup.md`. `stderr.txt`/`stdout.txt` saíram do versionamento.
- [x] Mantidos por precaução: `data/` e `docs/exata/` (integração Exata),
      `Dockerfile`, `nginx.conf`, `PUBLICAR-NO-AR.bat`.

---

## Pendente (depende do dono)

1. **Rotacionar/desativar o projeto Firebase "vagasrt"** — as credenciais
   estiveram versionadas; o arquivo saiu do código, mas continua no histórico
   do Git. Se o projeto não é usado, o ideal é apagá-lo no console do Firebase.
2. **Credenciais reais da Meta** para o WhatsApp funcionar de verdade:
   `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` e `WHATSAPP_CRYPTO_KEY` no
   `.env`; Phone Number ID / WABA ID / Access Token por conta em
   *WhatsApp → Conexões*. Guia: `docs/WHATSAPP-DEPLOY.md`.
3. **Deploy** — commits estão locais, ainda não enviados.

## Módulo WhatsApp via QR Code (bot de palavras-chave)
Ainda **não iniciado**. Deve ficar tecnicamente separado da API Oficial, sem
misturar arquitetura, e sem IA generativa nas respostas.
