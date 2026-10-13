# Fábrica de vídeos local (Windows)

Painel web (navegador) → API local `127.0.0.1:8787` → worker em segundo plano → SQLite + arquivos em `output/`.
O navegador nunca executa FFmpeg/Piper/Ollama; a API só enfileira e lê jobs.

## Requisitos
| Ferramenta | Versão | Instalação |
|---|---|---|
| Node.js | 22.18+ (ou 24 LTS) — usa `node:sqlite` e type stripping nativos | `winget install OpenJS.NodeJS.LTS` |
| Ollama | atual | `winget install Ollama.Ollama`, depois `ollama pull qwen2.5:7b` |
| FFmpeg + FFprobe | 6+ | `winget install Gyan.FFmpeg` |
| Piper | 2023.11.14-2 + voz `pt_BR-faber-medium` | baixado pelo script de setup |

Nenhuma dependência Python é necessária. `qwen2.5:7b` roda em CPU com 32 GB de RAM (mais lento sem GPU dedicada; ~1–4 min por roteiro).

## Instalação
```powershell
git clone <seu-repo>; cd <seu-repo>
powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
notepad .env.local      # confirme PIPER_EXE e PIPER_VOICE
npm run local:doctor    # todas as linhas devem mostrar OK
```

## Uso
```powershell
npm run local:api       # terminal 1
npm run local:worker    # terminal 2
npm run dev             # terminal 3 — abra http://localhost:8080/producao
```
Teste ponta a ponta (gera um MP4 sem o painel):
```powershell
npm run local:generate -- "Como funciona o segundo turno nas eleições"
```
Saída: `output\jobs\<id>\{script.json, narration.wav, subtitles.srt, video.mp4}`.

## Estados do job
`queued → generating_script → generating_voice → rendering → quality_check → approved | rejected`, ou `failed`.
Erros recuperáveis (Ollama fora, JSON inválido) voltam para a fila até `MAX_ATTEMPTS`. Jobs interrompidos são recuperados quando o worker reinicia. Jobs `failed`/`rejected` podem ser repetidos pelo painel.

## Controle de qualidade
Técnico (FFprobe): arquivo legível, fluxos de vídeo e áudio, 1080x1920, duração dentro dos limites, contêiner MP4.
"Aprovado" significa só aprovação técnica — revisão editorial/factual continua necessária.

## Testes
`npm run test:local` — validação de roteiro, transições, dependências ausentes, FFprobe, novas tentativas e bloqueio de publicação.

## Ainda não implementado
- Imagens/visuais gerados (o vídeo usa fundo sólido; legendas vão como faixa selecionável, não queimadas)
- Checagem editorial/de fontes automatizada
- Integração TikTok Content Posting API (OAuth, upload). A publicação fica bloqueada e só registra o motivo
- Agendamento automático de 3 vídeos/dia (enfileire pelo painel ou pela API)
