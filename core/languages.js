// -----------------------------------------------------------
// core/languages.js — Compiler/runtime detection & configuration
// -----------------------------------------------------------
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const fs = require('fs');
const path = require('path');

// Đường dẫn GCC Portable (nếu đã tải về)
const PORTABLE_GCC_DIR = path.join(__dirname, '..', 'gcc-toolchain', 'bin');
const portableGpp = path.join(PORTABLE_GCC_DIR, 'x86_64-linux-musl-g++');
const portableGcc = path.join(PORTABLE_GCC_DIR, 'x86_64-linux-musl-gcc');

const gppCmd = fs.existsSync(portableGpp) ? portableGpp : 'g++';
const gccCmd = fs.existsSync(portableGcc) ? portableGcc : 'gcc';

/**
 * Per-language configuration.
 *   compileCmd : function(src, out) → { cmd, args }   (null if interpreted)
 *   runCmd     : function(binary)   → { cmd, args }
 *   ext        : source file extension
 *   detectCmd  : command + args used to check if the compiler/runtime exists
 */
const LANGUAGES = {
  cpp: {
    ext: '.cpp',
    detectCmd: [gppCmd, ['--version']],
    compile: (src, out) => ({
      cmd: gppCmd,
      args: ['-O2', '-std=c++17', '-o', out, src],
    }),
    run: (binary) => ({ cmd: binary, args: [] }),
    available: false,
  },
  c: {
    ext: '.c',
    detectCmd: [gccCmd, ['--version']],
    compile: (src, out) => ({
      cmd: gccCmd,
      args: ['-O2', '-o', out, src],
    }),
    run: (binary) => ({ cmd: binary, args: [] }),
    available: false,
  },
  python: {
    ext: '.py',
    detectCmd: ['python3', ['--version']],
    compile: null, // interpreted
    run: (source) => ({ cmd: 'python3', args: [source] }),
    available: false,
  },
  pascal: {
    ext: '.pas',
    detectCmd: ['fpc', ['-h']],
    compile: (src, out) => ({
      cmd: 'fpc',
      args: ['-O2', `-o${out}`, src],
    }),
    run: (binary) => ({ cmd: binary, args: [] }),
    available: false,
  },
};

/**
 * Probe each language's compiler/runtime at startup.
 * Never throws — missing compilers are simply marked unavailable.
 */
async function detectAvailableCompilers() {
  const checks = Object.entries(LANGUAGES).map(async ([name, lang]) => {
    const [cmd, args] = lang.detectCmd;
    try {
      await execFileAsync(cmd, args, { timeout: 5000 });
      lang.available = true;
    } catch {
      lang.available = false;
    }
    console.log(
      `[INIT]   ${name.padEnd(8)} → ${lang.available ? '✓ available' : '✗ not found'}`,
    );
  });
  await Promise.all(checks);
}

/**
 * Returns a plain object { cpp: true, c: true, python: true, pascal: false }
 */
function getLanguageStatus() {
  const out = {};
  for (const [name, lang] of Object.entries(LANGUAGES)) {
    out[name] = lang.available;
  }
  return out;
}

/**
 * Get the config object for a given language key.
 */
function getLanguage(key) {
  return LANGUAGES[key] || null;
}

module.exports = { detectAvailableCompilers, getLanguageStatus, getLanguage };
