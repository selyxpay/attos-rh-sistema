@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo    PUBLICAR R^&T VAGAS NO AR  (Firebase Hosting - vagasrt)
echo ============================================================
echo.
echo 1) Se pedir login, vai abrir o navegador.
echo    Entre com a conta Google DONA do projeto vagasrt e clique Permitir.
echo.
echo 2) Depois ele publica o sistema sozinho.
echo.
echo ------------------------------------------------------------
echo  Verificando login...
echo ------------------------------------------------------------
call firebase login
echo.
echo ------------------------------------------------------------
echo  Publicando o site (enviando a pasta)...
echo ------------------------------------------------------------
call firebase deploy --only hosting
echo.
echo ============================================================
echo  Se apareceu "Deploy complete!" e um link, ESTA NO AR!
echo  Guarde esse link (Hosting URL) - e o endereco do sistema.
echo ============================================================
echo.
pause
