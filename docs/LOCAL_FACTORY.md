# Fábrica de vídeos local (Windows)

Painel web → API local `127.0.0.1:8787` → worker em segundo plano → SQLite + arquivos em `output/`.
O navegador nunca executa FFmpeg/Piper/Ollama; a API só enfileira, lê e registra decisões. Geração, agendamento e upload TikTok rodam no worker.

## Fluxo de um vídeo
`queued → researching → generating_script → generating_voice → rendering → quality_check → awaiting_review → approved` (humano)
Saídas alternativas: `rejected` (QC técnico ou revisão humana), `failed`, `cancelled`, `paused` (só na fila).

1. **Pesquisa**: links que você informar + Wikipédia (API oficial, fonte secundária). Cada fonte guarda URL e horário da consulta.
2. **Roteiro** (Ollama): 3–10 cenas em pt-BR; afirmações factuais precisam citar IDs de fonte (`S1`…).
3. **Verificação automática**: compara termos e números da afirmação com o trecho da fonte. Resultado: `textual_evidence`, `weak_evidence`, `unsupported` ou `analysis`. **Não é checagem de fatos** — todo vídeo exige revisão humana.
4. **Narração** (Piper): um WAV por cena → tempos reais; legendas sincronizadas por cena.
5. **Imagens**: primeiro sua pasta `ASSETS_DIR`; depois Wikimedia Commons, só com licença CC0 / domínio público / CC BY / CC BY-SA (crédito gravado no vídeo e na legenda do post). Sem imagem adequada → fundo neutro.
6. **Render** (FFmpeg): 1080x1920, 30 fps, H.264 + AAC 48 kHz, áudio normalizado (−14 LUFS), **legendas gravadas** (ASS).
7. **QC técnico**: arquivo, fluxos, resolução, duração, MP4, volume/clipping, legendas presentes e gravadas, sincronia vídeo/áudio/legendas. Relatório em `qc_report.json` (seções técnica, factual, imagens, humana).
8. **Revisão humana** no painel: observação obrigatória + confirmação de que as afirmações foram conferidas.
9. **Publicação TikTok** (opcional): só com `PUBLISHING_ENABLED=true`, QC aprovado, aprovação humana, conta autorizada com `video.publish` e privacidade escolhida.

Arquivos: `output\jobs\<id>\{research.json, script.json, scene-NN.wav, scene-NN.jpg, narration.wav, scenes.json, captions.srt, captions.ass, video.mp4, qc_report.json}`.

## Requisitos
| Ferramenta | Versão | Instalação |
|---|---|---|
| Node.js | 22.18+ ou 24 LTS (`node:sqlite`, type stripping) | `winget install OpenJS.NodeJS.LTS` |
| Ollama | atual | `winget install Ollama.Ollama` → `ollama pull qwen2.5:7b` (~4,7 GB) |
| FFmpeg + FFprobe | 6+ **com libass** | `winget install Gyan.FFmpeg` (build completa) |
| Piper | 2023.11.14-2 | baixado pelo script de setup para `tools\piper` |
| Voz pt-BR | `pt_BR-faber-medium` (.onnx + .onnx.json, ~63 MB) | baixada pelo script de setup |

Armazenamento: ~6 GB para modelo + ferramentas; cada vídeo ocupa ~10–40 MB (mais WAVs temporários). Reserve 10 GB livres.
Sem GPU, o roteiro leva minutos (estimativa, não medida no seu PC).

## Instalação (quando for fazer)
```powershell
git clone <seu-repo>; cd <seu-repo>
powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
notepad .env.local      # confirme PIPER_EXE, PIPER_VOICE e HTTP_USER_AGENT (com seu e-mail)
npm run local:doctor    # só verifica dependências; não gera vídeo nem publica
```
`FALHA` = obrigatório; `AVISO` = opcional (internet, biblioteca de imagens, TikTok).

## Iniciar / parar
```powershell
npm run local:api       # terminal 1
npm run local:worker    # terminal 2 (pesquisa, render, agendador, uploads)
npm run dev             # terminal 3 — abra http://localhost:8080/producao
```
Parar: `Ctrl+C` em cada terminal. O worker termina a etapa atual; jobs interrompidos voltam para a fila no próximo início (até `MAX_ATTEMPTS`). Uploads interrompidos ficam como `failed` para você reenviar.

Teste de um vídeo sem o painel: `npm run local:generate -- "Como funciona o segundo turno"` (termina em `awaiting_review`).

## Agendamento (3 vídeos/dia)
Desativado por padrão. Na aba **Agendamento**: ligue, defina horários (padrão 12:00, 18:00, 21:00), fuso (`America/Sao_Paulo`), limite diário, antecedência e a lista de temas. O worker cria um job por horário dentro da janela de antecedência; cada horário gera no máximo um job (índice único), temas já usados não se repetem, horários perdidos não são recriados. Pausar/retomar pelo painel. Publicação nunca é automática.

## Imagens próprias
Coloque `.jpg/.png` em `assets\library`. Opcional: `nome.json` com `{"license":"CC BY 4.0","author":"...","source_url":"...","tags":["urna","votação"]}`. A escolha é por palavras do `visual_query` da cena.

## TikTok — requisitos
1. Conta em developers.tiktok.com, crie um app e adicione **Login Kit** e **Content Posting API** (Direct Post).
2. Escopos: `user.info.basic`, `video.publish`.
3. Cadastre o Redirect URI exatamente como `TIKTOK_REDIRECT_URI` (padrão `http://127.0.0.1:8787/tiktok/callback`). Se o portal não aceitar http/localhost para o tipo do app, use o tipo Desktop (`TIKTOK_APP_TYPE=desktop`, com PKCE) — **não verificado por mim**; confirme no portal.
4. Copie Client Key/Secret para `.env.local`. Conecte pela aba **TikTok** do painel.
5. Até a TikTok auditar o app, posts só podem ser **privados (SELF_ONLY)**. A auditoria exige demonstrar o fluxo e as regras de UX da TikTok.
6. Ative `PUBLISHING_ENABLED=true` apenas quando quiser publicar. Posts são marcados como conteúdo gerado por IA (`is_aigc`).

## Solução de problemas
- **Painel "desconectado"**: API não está rodando, porta diferente, ou origem não está em `ALLOWED_ORIGINS`.
- **Ollama indisponível**: abra o app Ollama ou rode `ollama serve`; o job volta para a fila sozinho.
- **"Modelo não encontrado"**: `ollama pull qwen2.5:7b`.
- **Piper falhou**: confira `PIPER_EXE` e que `.onnx.json` está ao lado do `.onnx`.
- **Sem legendas / erro no filtro subtitles**: FFmpeg sem libass — instale a build completa.
- **Volume reprovado**: verifique a voz; o render já normaliza o áudio.
- **Sem imagens**: sem internet ou nenhuma imagem com licença livre; adicione imagens próprias.
- **TikTok `scope_not_authorized` / `unaudited_client_can_only_post_to_private_accounts`**: escopo não aprovado ou app não auditado — use SELF_ONLY.

## Testes
`npm run test:local` — roteiro por cenas, verificação de afirmações, legendas, estados, pausa/cancelar/repetir, recuperação, QC, agendador, bloqueio de publicação, regras TikTok, filtro de licença e um render FFmpeg real com tons no lugar do Piper.

## Ainda não verificado / não implementado
- Nada foi executado em Windows; Ollama e Piper reais não foram testados aqui.
- Fluxo OAuth e upload TikTok não foram testados contra a TikTok real (sem credenciais).
- Fontes primárias (TSE, Planalto) não são pesquisadas automaticamente — informe os links ao criar o job.
- Movimento de câmera nas imagens e trilha sonora não existem.
