# A VPS travou — o que conferir (passo a passo)

Escrito para: o João, com a VPS na mão (SSH), sem precisar saber programar.

Sintoma que este guia resolve: **o site E o painel do Coolify param juntos**
(`ERR_CONNECTION_TIMED_OUT`) e o painel da Hostinger mostra "Aguardando os
dados". Quando os três caem ao mesmo tempo, o problema **não é o sistema ATTOS RH**
— é a máquina inteira sem recurso. O ATTOS RH sozinho usa ~200 MB.

Aconteceu em **23/10/2026, ~15h**, logo depois de duas coisas no mesmo dia:
atualização do Coolify (4.1.2 → 4.5.0) e um deploy forçado. As duas juntas
puxam imagens novas, constroem a imagem do zero e enchem disco e memória.

## 1. O bloco de diagnóstico (cole tudo de uma vez)

Entre por SSH e cole este bloco inteiro. Ele só **lê** — não muda nada. Depois
me manda a saída.

```bash
{
echo "===== QUANDO LIGOU / CARGA ====="; uptime; who -b
echo "===== MEMORIA ====="; free -h
echo "===== DISCO ====="; df -h /; df -h /var/lib/docker 2>/dev/null
echo "===== INODES (disco pode encher de arquivo pequeno) ====="; df -i /
echo "===== O KERNEL MATOU ALGUEM POR FALTA DE MEMORIA? (boot anterior) ====="
journalctl -b -1 -k | grep -iE "out of memory|oom-kill|killed process|oom_reaper" | tail -30
echo "===== ... E NESTE BOOT ====="
journalctl -k | grep -iE "out of memory|oom-kill|killed process" | tail -20
echo "===== ULTIMOS 80 AVISOS DO BOOT ANTERIOR ====="
journalctl -b -1 -p warning --no-pager | tail -80
echo "===== COMO O BOOT ANTERIOR TERMINOU (fim do log) ====="
journalctl -b -1 --no-pager | tail -40
echo "===== DOCKER: ESTA REINICIANDO EM LOOP? ====="
systemctl status docker --no-pager | head -20
journalctl -u docker -b -1 --no-pager | tail -40
echo "===== CONTEINERES AGORA ====="
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
echo "===== QUEM COME MEMORIA/CPU AGORA ====="
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}"
echo "===== QUANTAS VEZES CADA UM JA REINICIOU ====="
docker inspect --format '{{.Name}} reinicios={{.RestartCount}} status={{.State.Status}} oom={{.State.OOMKilled}}' $(docker ps -aq) 2>/dev/null
echo "===== LIXO DO DOCKER (imagens e cache de build) ====="
docker system df
echo "===== PHP FORA DO DOCKER (CVE-2026-115560) ====="
php -v 2>&1 | head -3; which php 2>/dev/null; dpkg -l 2>/dev/null | grep -c "^ii  php"
echo "===== SAUDE DO SISTEMA ATTOS RH ====="
curl -s -m 10 http://127.0.0.1/api/saude 2>/dev/null || curl -s -m 10 https://SEU-DOMINIO/api/saude
echo
} 2>&1 | tee /tmp/diagnostico-rt.txt
```

A saída fica salva em `/tmp/diagnostico-rt.txt`.

## 2. Como ler o resultado

| O que aparecer | O que significa | O que fazer |
|---|---|---|
| `oom-kill` / `Out of memory: Killed process` | **faltou memória**: o kernel começou a matar processos. É a causa mais comum quando o painel e o site caem juntos | item 3 (limites) e item 4 (limpeza) |
| `df -h /` com **90% ou mais** em uso | **disco cheio**. Com o disco cheio o Docker, o banco e o log param todos juntos | item 4 (limpeza) |
| `df -i /` com **100%** em uso | acabaram os **inodes** (muitos arquivos pequenos) | item 4 (limpeza) |
| `docker system df` com vários GB em **Build Cache** / imagens `<none>` | lixo de build acumulado — típico depois de deploys forçados | item 4 (limpeza) |
| `reinicios=` alto num contêiner, ou `oom=true` | aquele contêiner é o que está estourando | item 3 (limites) |
| `journalctl -u docker` com o Docker subindo e caindo | Docker em loop | mande a saída; é tratamento à parte |
| nada disso, e `uptime` mostrando carga alta (acima do nº de CPUs) | CPU ou I/O travado — pode ser vizinho na Hostinger (CPU steal) | abra chamado na Hostinger com o log |

## 3. Limites de memória (para o sistema nunca mais derrubar a VPS)

Metade já está no código: o `Dockerfile` do ATTOS RH agora sobe com
`NODE_OPTIONS=--max-old-space-size=512`. Se algo comer memória, o Node morre
dentro do contêiner e o Coolify o levanta — a VPS nem sente.

A outra metade é **sua, no painel**, e é a que vale mais:

1. Coolify → aplicação **ATTOS RH** → **Advanced** (ou **Resource Limits**).
2. **Memory Limit:** `768M`
3. **Memory Swap:** `1G`
4. **CPU Limit:** `1.5` (se a VPS tiver 2 vCPU)
5. Salvar e **Redeploy**.

Faça o mesmo nos outros serviços que você tem na VPS. A conta precisa fechar:
**some os limites de todos os contêineres + ~1 GB para o sistema e o Coolify**
e isso tem que caber na memória da VPS (`free -h`). Se não couber, não há
limite que salve — é hora de subir o plano.

## 4. Limpeza segura (não apaga dado nenhum)

**Confira antes** o que vai sair:

```bash
docker system df
```

**Pode rodar** — tira só imagens sem uso, contêineres parados e cache de build:

```bash
docker builder prune -af          # cache de build (o que mais cresce)
docker image prune -af            # imagens que nenhum conteiner usa
docker container prune -f         # conteineres parados
sudo journalctl --vacuum-size=200M   # log do sistema limitado a 200 MB
df -h /                           # confere o resultado
```

**NUNCA rode** nenhum destes — eles apagam os dados:

```bash
docker system prune --volumes     # NAO! apaga os volumes (state.json, whatsapp.db, fotos)
docker volume prune               # NAO!
docker system prune -a --volumes  # NAO!
```

Regra simples: **comando com a palavra `volume` não entra.** Os dados do ATTOS RH
(`state.json`, `whatsapp.db`, as fotos) vivem no volume montado em `/data`.

Depois da limpeza, confira que o sistema respondeu:

```bash
curl -s https://SEU-DOMINIO/api/saude
docker ps --format "table {{.Names}}\t{{.Status}}"
```

## 5. O PHP (CVE-2026-115560)

O sistema ATTOS RH **não usa PHP** (imagem `node:20-alpine`, uma única dependência,
`npm audit` com 0 vulnerabilidades). Mas o **Coolify é feito em PHP/Laravel** e
a Hostinger pode ter deixado PHP instalado na máquina. O bloco do item 1 já
roda `php -v`; se ele mostrar uma versão:

```bash
sudo apt update && sudo apt upgrade -y
php -v
```

E mantenha o Coolify atualizado (você já está no 4.5.0, que é o recomendado):

```bash
curl -fsSL https://cdn.coollabs.io/coolify/upgrade.sh | sudo bash
```

## 6. Para a próxima atualização não derrubar nada

- **Uma coisa por vez.** Atualizar o Coolify e forçar deploy no mesmo minuto foi
  o que juntou pico de memória com pico de disco.
- **Antes de atualizar o Coolify:** `df -h /` e `free -h`. Se o disco estiver
  acima de 80%, limpe primeiro (item 4).
- **Depois de atualizar:** confira `curl -s https://SEU-DOMINIO/api/saude`.
- **Deploy forçado só quando precisar.** Ele reconstrói a imagem do zero, e é a
  operação mais pesada que a VPS faz.
