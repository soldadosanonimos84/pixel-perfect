// Safe subprocess runner: argument arrays only, never a shell. Binaries come from config, not user input.
import { spawn } from "node:child_process";

export class DependencyMissingError extends Error {
  exe: string;
  constructor(exe: string) {
    super(`Executável não encontrado: "${exe}". Verifique o caminho no .env.local.`);
    this.exe = exe;
  }
}

export interface RunResult { code: number; stdout: string; stderr: string }

export function run(exe: string, args: string[], opts: { input?: string; timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(exe, args, { shell: false, windowsHide: true });
    } catch {
      return reject(new DependencyMissingError(exe));
    }
    let stdout = "";
    let stderr = "";
    const timer = opts.timeoutMs ? setTimeout(() => child.kill(), opts.timeoutMs) : null;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      reject(err.code === "ENOENT" ? new DependencyMissingError(exe) : err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    if (opts.input !== undefined) child.stdin.end(opts.input, "utf8");
    else child.stdin.end();
  });
}
