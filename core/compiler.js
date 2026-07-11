// -----------------------------------------------------------
// core/compiler.js — Compile source code for compiled languages.
// -----------------------------------------------------------
const path = require('path');
const { runInSandbox } = require('./sandbox');

// Generous compile timeout — compilers can be slow on constrained hardware
const COMPILE_TIMEOUT_MS = 30_000;
const COMPILE_MAX_BUFFER = 1 * 1024 * 1024; // 1 MB compiler output cap

/**
 * Compile source code to a binary.
 *
 * @param {object} langConfig  — language config from languages.js
 * @param {string} sourcePath  — absolute path to source file
 * @param {string} outputPath  — absolute path for the compiled binary
 * @param {string} workDir     — working directory
 *
 * @returns {Promise<{ success: boolean, compileOutput: string }>}
 */
async function compileSource(langConfig, sourcePath, outputPath, workDir) {
  if (!langConfig.compile) {
    // Interpreted language — nothing to compile
    return { success: true, compileOutput: '' };
  }

  const { cmd, args } = langConfig.compile(sourcePath, outputPath);

  const result = await runInSandbox({
    cmd,
    args,
    timeoutMs: COMPILE_TIMEOUT_MS,
    memoryMb: 512, // compilers may need more memory
    maxBuffer: COMPILE_MAX_BUFFER,
    cwd: workDir,
    useUlimit: false, // don't ulimit the compiler itself
    env: process.env, // allow compiler full access to system env (PATH, etc)
  });

  const compileOutput = (result.stdout + '\n' + result.stderr).trim();

  if (result.exitCode !== 0) {
    return { success: false, compileOutput };
  }

  return { success: true, compileOutput };
}

module.exports = { compileSource };
