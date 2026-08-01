# Equipamentos — Proteção dos Dados e Restauração

Guia da rede de segurança do módulo **Departamento Pessoal → Entrega e Devolução
de Equipamentos**. Esses são os dados mais críticos da operação (pessoas,
equipamentos, fotos, documentos e histórico) e têm proteção própria.

---

## 1. Onde os dados ficam

| O quê | Onde | Observação |
|---|---|---|
| Registros (fonte da verdade) | `DATA_DIR/state.json` → `dados.equipamentos` | Junto com o resto do sistema |
| **Cópia independente** | `DATA_DIR/equipamentos/equipamentos.json` | **Só de equipamentos**, regravada a cada alteração |
| Versões anteriores | `DATA_DIR/equipamentos/snapshots/` | As 30 mais recentes |
| Registros excluídos | `DATA_DIR/equipamentos/excluidos.json` | Toda exclusão fica guardada aqui |
| Fotos e documentos | `DATA_DIR/uploads/` | Nunca são apagados pelo sistema |
| Backups gerais | `DATA_DIR/backups/` | 24 por hora + 7 por dia |

> Cada registro tem **ID único** (`equip-...`). A posição na lista nunca é usada
> como identificador, então excluir um registro não afeta os outros, e as fotos
> continuam ligadas ao ID certo.

---

## 2. As três proteções (automáticas)

### Guarda anti-sumiço
Antes de gravar, o servidor compara o que vai ser salvo com o que já está lá:

- Save que **não traz** a lista de equipamentos (aba antiga, página carregada
  pela metade, falha de rede) → a lista gravada é **preservada**.
- Save que apagaria **vários registros de uma vez** (mais de 3, ou metade ou
  mais da lista) → tratado como acidente: os registros são **devolvidos** e
  fica um aviso no log.
- Excluir **1 registro** pela tela (com permissão e confirmação) continua
  funcionando — é a única forma de exclusão que existe no sistema.

Vale também para candidatos, funcionários, contratações, exames médicos, banco
de talentos e fluxos financeiros.

### Espelho independente
A cada alteração, os equipamentos são copiados para
`DATA_DIR/equipamentos/equipamentos.json`, com a contagem de registros, a
contagem de fotos e a lista de arquivos referenciados em `uploads/`.
**Se o `state.json` for corrompido ou perdido, os equipamentos continuam
recuperáveis sozinhos**, sem depender do banco principal.

### Arquivo de excluídos
Todo registro removido é guardado em `equipamentos/excluidos.json` com a data.
Nenhuma exclusão é irreversível.

> Se o módulo de proteção falhar por qualquer motivo, o sistema **continua
> salvando normalmente** — ele nunca derruba o save.

---

## 3. Conferir se está tudo certo

```bash
cd /caminho/do/projeto
node restaurar-equipamentos.cjs
```

Isso **não altera nada**. Mostra:

```
Espelho lido de : equipamentos.json
  registros     : 912
  fotos         : 875

Estado atual do sistema:
  registros     : 912
  fotos         : 875

--- COMPARAÇÃO ---
  registros que voltariam: 0
```

`registros que voltariam: 0` = sistema e espelho batem, está tudo certo.

---

## 4. Restaurar (quando algo deu errado)

**Passo 1 — confira primeiro (sempre):**

```bash
node restaurar-equipamentos.cjs
```

Se aparecer, por exemplo, `registros que voltariam: 47`, é porque 47 registros
estão no espelho mas sumiram do sistema.

**Passo 2 — restaure:**

```bash
node restaurar-equipamentos.cjs --aplicar
pm2 restart rt-vagas
```

O script **faz backup do `state.json` antes de mexer**
(`backups/state-antes-de-restaurar-<data>.json`) e só **ADICIONA** o que está
faltando — nunca sobrescreve registro que já existe.

**Para voltar a uma versão mais antiga** (snapshot):

```bash
ls server-data/equipamentos/snapshots/
node restaurar-equipamentos.cjs --de-snapshot equipamentos-2026-08-01T12-00-00.json
node restaurar-equipamentos.cjs --de-snapshot equipamentos-2026-08-01T12-00-00.json --aplicar
pm2 restart rt-vagas
```

---

## 5. Backup manual (recomendado antes de qualquer atualização)

```bash
# só os equipamentos (rápido)
cp -r server-data/equipamentos ~/backups/equip-$(date +%F-%H%M)

# tudo (registros + fotos + documentos)
tar -czf ~/backups/rt-$(date +%F).tar.gz server-data/
```

Agendar diariamente às 3h (`crontab -e`):

```
0 3 * * * cd /caminho/do/projeto && tar -czf ~/backups/rt-$(date +\%F).tar.gz server-data/
```

---

## 6. Se uma foto não abrir

As fotos ficam em `DATA_DIR/uploads/` e o registro guarda só o link
(`/uploads/...`). A conferência mostra se algum arquivo citado sumiu do disco:

```bash
node restaurar-equipamentos.cjs
# ... Arquivos de foto/documento referenciados: 875  (todos presentes)
```

Se aparecer "não encontrado(s)", os arquivos estão no backup —
restaure a pasta `uploads/` do `tar.gz` mais recente.

---

## 7. Perguntas rápidas

**Excluí um registro sem querer. Perdi?**
Não. Ele está em `server-data/equipamentos/excluidos.json`, com data. Basta
copiar o objeto `registro` de volta ou usar um snapshot anterior.

**Uma atualização do sistema pode apagar os dados?**
Não. `git pull` só troca código; os dados ficam em `DATA_DIR`, que não é tocado.

**Duas pessoas cadastrando ao mesmo tempo dá problema?**
Não. O servidor mescla por ID (adiciona o novo sem apagar o da outra pessoa) e
o guarda anti-sumiço é a barreira final.

**A lista apareceu vazia mas os números aparecem. E agora?**
A tela avisa quando os filtros estão escondendo tudo e oferece o botão
**"Limpar filtros e mostrar tudo"**. Os dados continuam salvos — é só a
visualização.
