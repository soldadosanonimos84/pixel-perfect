<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Real video generation lives in `local/` (Node API + worker on the user's PC, SQLite via node:sqlite); the browser only calls it over 127.0.0.1 — Windows binaries can't run in the web app.
- Long jobs run in the worker process, never inside HTTP handlers — keeps the API responsive and jobs recoverable.
- Subprocesses use argument arrays with config-defined executables only — prevents command injection.
- The in-browser store (`src/lib/store.ts`) is a labeled simulation; never present its results as real production.
- Job flow: research -> script -> voice -> render -> technical QC -> awaiting_review; only a human review moves a job to approved, and publishing requires approved + QC passed + TikTok auth — keeps technical, factual and human gates separate.
- Claim/source matching (`local/src/verify.ts`) is a heuristic and must never be labeled as fact-checking.
- Scheduler (`local/src/scheduler.ts`) is opt-in, runs inside the worker, and dedupes via a unique `scheduled_for` index — safe across restarts and multiple workers.
- TikTok uses only the official Login Kit + Content Posting API; uploads run in the worker and status comes from TikTok responses — never simulate publishing.
- Captions are burned via an ASS file referenced relative to the job dir (FFmpeg cwd) — avoids Windows filter-path escaping.
