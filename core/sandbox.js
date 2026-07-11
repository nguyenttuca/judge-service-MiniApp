// -----------------------------------------------------------
// core/sandbox.js — Execute a command inside a resource-limited
//                   child process (timeout, memory, env isolation).
// -----------------------------------------------------------
const { spawn } = require('child_process');
const path = require('path');

// Default caps
const DEFAULT_MAX_BUFFER = 4 * 1024 * 1024; // 4 MB stdout/stderr cap
const SPAWN_OVERHEAD_MS = 500;               // extra grace for process startup

/**
 * Run a command with strict resource limits.
 *
 * @param {object} opts
 * @param {string}   opts.cmd           — executable path or name
 * @param {string[]} opts.args          — arguments
 * @param {string}   [opts.stdin]       — data piped to stdin
 * @param {number}   opts.timeoutMs     — wall-clock timeout (ms)
 * @param {number}   [opts.memoryMb]    — virtual memory limit (MB)
 * @param {number}   [opts.maxBuffer]   — max stdout+stderr bytes
 * @param {string}   [opts.cwd]         — working directory
 * @param {boolean}  [opts.useUlimit]   — wrap in bash + ulimit (default true)
 *
 * @returns {Promise<{
 *   exitCode: number|null,
 *   signal: string|null,
 *   stdout: string,
 *   stderr: string,
 *   timedOut: boolean,
 *   oom: boolean,
 *   timeMs: number,
 *   memoryKb: number
 * }>}
 */
function runInSandbox(opts) {
  const {
    cmd,
    args = [],
    stdin = '',
    timeoutMs = 5000,
    memoryMb = 256,
    maxBuffer = DEFAULT_MAX_BUFFER,
    cwd = process.cwd(),
    useUlimit = true,
    env,
  } = opts;

  return new Promise((resolve) => {
    const wallTimeout = timeoutMs + SPAWN_OVERHEAD_MS;

    // Build the actual command: optionally wrap with ulimit via bash
    let spawnCmd, spawnArgs;
    if (useUlimit) {
      const memKb = memoryMb * 1024;
      const cpuSec = Math.ceil(timeoutMs / 1000) + 2; // slight buffer
      const maxProcs = 64; // fork-bomb guard
      const ulimits = [
        `ulimit -v ${memKb}`,   // virtual memory
        `ulimit -t ${cpuSec}`,  // CPU seconds
        `ulimit -u ${maxProcs}`, // max user processes
      ].join('; ');

      // Escape args for shell — wrap each in single quotes
      const escaped = [cmd, ...args]
        .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
        .join(' ');

      spawnCmd = '/bin/bash';
      spawnArgs = ['-c', `${ulimits}; exec ${escaped}`];
    } else {
      spawnCmd = cmd;
      spawnArgs = args;
    }

    const startHr = process.hrtime.bigint();

    const child = spawn(spawnCmd, spawnArgs, {
      cwd,
      env: env || { PATH: process.env.PATH + ':' + path.join(__dirname, '..', 'gcc-toolchain', 'bin') },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: wallTimeout,
    });

    let stdout = '';
    let stderr = '';
    let stdoutLen = 0;
    let stderrLen = 0;
    let killed = false;
    let peakMemKb = 0;

    // ---- Memory sampling (Linux /proc) ----
    let memPoller = null;
    if (child.pid) {
      const procStatus = `/proc/${child.pid}/status`;
      memPoller = setInterval(() => {
        try {
          const fs = require('fs');
          const content = fs.readFileSync(procStatus, 'utf-8');
          const match = content.match(/VmRSS:\s+(\d+)\s+kB/);
          if (match) {
            const rss = parseInt(match[1], 10);
            if (rss > peakMemKb) peakMemKb = rss;
          }
        } catch {
          // Process may have already exited or /proc unavailable (macOS)
        }
      }, 50);
    }

    // ---- Collect stdout ----
    child.stdout.on('data', (chunk) => {
      stdoutLen += chunk.length;
      if (stdoutLen <= maxBuffer) {
        stdout += chunk;
      } else if (!killed) {
        killed = true;
        child.kill('SIGKILL');
      }
    });

    // ---- Collect stderr ----
    child.stderr.on('data', (chunk) => {
      stderrLen += chunk.length;
      if (stderrLen <= maxBuffer) {
        stderr += chunk;
      }
      // Don't kill on stderr overflow — just truncate
    });

    child.on('close', (exitCode, signal) => {
      if (memPoller) clearInterval(memPoller);

      const elapsedNs = process.hrtime.bigint() - startHr;
      const timeMs = Number(elapsedNs / 1_000_000n);

      const timedOut =
        signal === 'SIGTERM' || signal === 'SIGKILL' || timeMs >= wallTimeout;

      // Heuristic: if killed by signal 9 and we hit memory → OOM
      const oom =
        !timedOut &&
        (signal === 'SIGKILL' || exitCode === 137) &&
        peakMemKb >= memoryMb * 1024 * 0.9;

      resolve({
        exitCode,
        signal,
        stdout: stdout.slice(0, maxBuffer),
        stderr: stderr.slice(0, maxBuffer),
        timedOut,
        oom,
        timeMs,
        memoryKb: peakMemKb,
      });
    });

    child.on('error', (err) => {
      if (memPoller) clearInterval(memPoller);
      resolve({
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: err.message,
        timedOut: false,
        oom: false,
        timeMs: 0,
        memoryKb: 0,
      });
    });

    // ---- Feed stdin ----
    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

module.exports = { runInSandbox };
