/**
 * COLE ESTE CÓDIGO NO APPS SCRIPT DA SUA PLANILHA DO FORMS.
 *
 * O que ele faz: sua planilha guarda só o LINK do Drive de cada foto (a "Coluna 10").
 * Pelo link não dá para saber o NOME do arquivo — e sem o nome o sistema não consegue
 * descobrir de quem é cada foto. Este script lê cada link e cria uma coluna nova,
 * chamada ARQUIVO, com o nome exato de cada foto.
 *
 * Ele acha a aba certa sozinho, PULA as linhas já preenchidas e CONTINUA DE ONDE PAROU
 * se o Google interromper por tempo. Pode executar quantas vezes quiser.
 * NÃO apaga nem altera nada do que já existe na planilha.
 */
function adicionarNomesDosArquivos() {
  var inicio = Date.now();
  var planilha = SpreadsheetApp.getActiveSpreadsheet();

  // 1) Procura, em todas as abas, a coluna que tem os links do Drive
  var aba = null, colLinks = -1;
  planilha.getSheets().forEach(function (a) {
    if (aba) return;
    var d = a.getDataRange().getValues();
    if (d.length < 2) return;
    for (var c = 0; c < d[0].length && colLinks < 0; c++) {
      for (var l = 1; l < Math.min(d.length, 100); l++) {
        if (String(d[l][c]).indexOf('drive.google.com') >= 0) { aba = a; colLinks = c; break; }
      }
    }
  });

  if (!aba) {
    SpreadsheetApp.getUi().alert('Não encontrei nenhuma coluna com links do Google Drive.');
    return;
  }

  var dados = aba.getDataRange().getValues();
  var cabecalho = dados[0];

  // 2) Cria a coluna ARQUIVO (ou reaproveita, se já existir — é o que permite continuar)
  var colArq = cabecalho.indexOf('ARQUIVO');
  if (colArq < 0) {
    colArq = cabecalho.length;
    aba.getRange(1, colArq + 1).setValue('ARQUIVO');
  }

  var feitos = 0, faltam = 0;
  var buffer = [], baseLinha = -1;

  function gravar() {
    if (!buffer.length) return;
    aba.getRange(baseLinha + 1, colArq + 1, buffer.length, 1).setValues(buffer);
    buffer = [];
    baseLinha = -1;
  }

  // 3) Percorre as linhas
  for (var l = 1; l < dados.length; l++) {

    // Já preenchida numa rodada anterior? pula
    if (String(dados[l][colArq] || '').trim()) { gravar(); continue; }

    // Perto do limite de 6 minutos do Google? grava o que tem e para
    if (Date.now() - inicio > 5 * 60 * 1000) {
      gravar();
      faltam = dados.length - l;
      break;
    }

    var nomes = [];
    String(dados[l][colLinks] || '').split(/[,\s]+/).forEach(function (url) {
      var id = url.match(/[-\w]{25,}/);      // o ID do arquivo dentro do link
      if (!id) return;
      try {
        nomes.push(DriveApp.getFileById(id[0]).getName());
      } catch (e) {
        nomes.push('(arquivo nao encontrado)');
      }
    });

    if (baseLinha < 0) baseLinha = l;
    buffer.push([nomes.join(', ')]);
    feitos++;

    if (buffer.length >= 50) gravar();       // grava de 50 em 50 (bem mais rápido)
  }
  gravar();

  SpreadsheetApp.getUi().alert(
    'Aba: ' + aba.getName() + '\n\n' +
    feitos + ' linha(s) preenchidas nesta rodada.\n\n' +
    (faltam > 0
      ? 'Ainda faltam ' + faltam + ' linhas.\nClique em EXECUTAR de novo para continuar de onde parou.'
      : 'TERMINOU! Todas as linhas já estão com o nome do arquivo na coluna ARQUIVO.')
  );
}
