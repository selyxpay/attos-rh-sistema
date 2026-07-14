# Como trazer os 900 registros do Google Forms para o sistema

Você vai fazer isso **uma vez só**. No fim, todos os registros e fotos estarão no sistema novo.

---

## Passo 1 — Gerar a coluna com o nome de cada foto (o mais importante)

A planilha do Forms guarda apenas o **link** do Drive, não o nome do arquivo. Sem o nome,
o sistema não sabe qual foto é de qual pessoa. Este script resolve isso.

1. Abra o **Formulário** → aba **Respostas** → clique no ícone verde **"Ver no Sheets"**.
2. Na planilha, vá em **Extensões → Apps Script**.
3. Apague o que estiver lá e **cole o código abaixo**.
4. Clique em **Executar** (▶). Na primeira vez o Google vai pedir permissão — autorize
   (é o seu próprio Google acessando o seu próprio Drive).
5. Ao terminar, aparece o aviso "Pronto!". Volte na planilha: existe uma coluna nova
   chamada **ARQUIVO**, com o nome de cada foto.

```javascript
function adicionarNomesDosArquivos() {
  const aba = SpreadsheetApp.getActiveSheet();
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];

  // Acha a coluna que contém os links do Drive
  let colUpload = -1;
  for (let c = 0; c < cabecalho.length && colUpload < 0; c++) {
    for (let l = 1; l < dados.length; l++) {
      if (String(dados[l][c]).indexOf('drive.google.com') >= 0) { colUpload = c; break; }
    }
  }
  if (colUpload < 0) {
    SpreadsheetApp.getUi().alert('Não encontrei nenhuma coluna com links do Drive.');
    return;
  }

  const novaCol = cabecalho.length + 1;
  aba.getRange(1, novaCol).setValue('ARQUIVO');

  for (let l = 1; l < dados.length; l++) {
    const celula = String(dados[l][colUpload] || '');
    const nomes = [];
    celula.split(/[,\s]+/).forEach(function (url) {
      const id = url.match(/[-\w]{25,}/);   // o ID do arquivo dentro do link
      if (!id) return;
      try { nomes.push(DriveApp.getFileById(id[0]).getName()); } catch (e) {}
    });
    aba.getRange(l + 1, novaCol).setValue(nomes.join(', '));
  }

  SpreadsheetApp.getUi().alert('Pronto! A coluna ARQUIVO foi criada com o nome de cada foto.');
}
```

> Com 900 linhas o script leva alguns minutos. Se o Google interromper por tempo,
> é só executar de novo — ele refaz a coluna do zero.

---

## Passo 2 — Baixar a planilha

Na planilha: **Arquivo → Fazer download → Microsoft Excel (.xlsx)**.

---

## Passo 3 — Baixar as fotos

1. Abra o **Google Drive**. As fotos do formulário ficam numa pasta com o nome do
   formulário (algo como *"Registro de Equipamentos (File responses)"*).
2. Clique com o botão direito na **pasta** → **Fazer download**.
   O Drive gera um **.zip** (com 900 fotos isso pode demorar e vir em vários arquivos .zip).
3. **Descompacte** o zip numa pasta do computador.

---

## Passo 4 — Importar no sistema

1. Entre no sistema → **Entrega/Devolução de Equipamentos**.
2. Clique em **"Importar do sistema antigo"**.
3. **Passo 1:** escolha a planilha `.xlsx` que você baixou.
4. **Passo 2:** o sistema já adivinha as colunas sozinho. Só confira. Em
   **"Arquivo(s) da foto"**, escolha a coluna **ARQUIVO** (a que o script criou).
5. **Passo 3:** clique em "Escolher as fotos", abra a pasta descompactada e
   selecione **todas de uma vez** (`Ctrl + A`).
6. **Passo 4:** o sistema mostra quantos vão entrar, quantos têm foto e quantos já
   foram importados antes. Confira a prévia e clique em **"Importar tudo"**.

Uma barra de progresso mostra o andamento. **Não feche a janela** até terminar.

---

## Coisas importantes

- **Pode rodar mais de uma vez sem medo.** O sistema marca cada registro importado e
  **pula os que já entraram** — não duplica nada. Se a internet cair no meio, é só
  rodar de novo com a mesma planilha: ele continua de onde parou.

- **Faça pelo computador, não pelo celular.** São muitos arquivos e o envio é longo.

- **Tempo e internet.** 900 fotos de ~3 MB dão cerca de **2,7 GB** de envio. Numa
  internet de 10 Mbps de upload isso leva perto de **1 hora**. Deixe o computador
  ligado e conectado no cabo, se possível.

- **Espaço no servidor.** Confirme que a sua VPS tem pelo menos **5 GB livres** antes
  de começar. As fotos ficam guardadas nela.

- **Registros sem foto entram do mesmo jeito** — e aparecem marcados na conferência.
  Você anexa a foto depois, editando o registro.

- **A data original é preservada.** O sistema usa o "Carimbo de data/hora" do Forms,
  não a data em que você importou.
