// -----------------------------------------------------------
// core/checker.js — Compare contestant output against expected output.
// -----------------------------------------------------------
const path = require('path');
const fs = require('fs');
const { runInSandbox } = require('./sandbox');

/**
 * Normalise text for diff comparison:
 *   - Trim leading/trailing whitespace on each line
 *   - Remove trailing blank lines
 *   - Collapse to a canonical form for comparison
 */
function normalise(text) {
  return text
    .replace(/\r\n/g, '\n')     // CRLF → LF
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');        // strip trailing newlines
}

/**
 * Diff checker — whitespace-tolerant line-by-line comparison.
 *
 * @param {string} actual   — contestant stdout
 * @param {string} expected — expected output from test case
 * @returns {boolean} true if accepted
 */
function diffCheck(actual, expected) {
  return normalise(actual) === normalise(expected);
}

/**
 * Compile a custom C++ checker program once per job.
 * @param {object} opts
 * @param {string} opts.checkerCode
 * @param {string} opts.workDir
 */
async function compileCustomChecker(opts) {
  const { checkerCode, workDir } = opts;
  const fsPromises = require('fs').promises;

  const checkerSrc = path.join(workDir, 'checker.cpp');
  const checkerBin = path.join(workDir, 'checker');

  await fsPromises.writeFile(checkerSrc, checkerCode, 'utf-8');

  const PORTABLE_GCC_DIR = path.join(__dirname, '..', 'gcc-toolchain', 'bin');
  const portableGpp = path.join(PORTABLE_GCC_DIR, 'x86_64-linux-musl-g++');
  const gppCmd = fs.existsSync(portableGpp) ? portableGpp : 'g++';

  const compileResult = await runInSandbox({
    cmd: gppCmd,
    args: ['-O2', '-std=c++17', '-o', checkerBin, checkerSrc],
    timeoutMs: 15_000,
    memoryMb: 512,
    cwd: workDir,
    useUlimit: false,
  });

  if (compileResult.exitCode !== 0) {
    return {
      success: false,
      checkerStderr: `Checker compilation failed:\n${compileResult.stderr}`,
    };
  }

  return { success: true, checkerBin };
}

/**
 * Run a compiled custom checker.
 * @param {object} opts
 */
async function runCustomCheck(opts) {
  const {
    checkerBin,
    inputData,
    actualOutput,
    expectedOutput,
    workDir,
    testIndex,
    timeoutMs = 10_000,
  } = opts;
  
  const fsPromises = require('fs').promises;

  const inputFile = path.join(workDir, `input_${testIndex}.txt`);
  const actualFile = path.join(workDir, `actual_${testIndex}.txt`);
  const expectedFile = path.join(workDir, `expected_${testIndex}.txt`);

  await Promise.all([
    fsPromises.writeFile(inputFile, inputData, 'utf-8'),
    fsPromises.writeFile(actualFile, actualOutput, 'utf-8'),
    fsPromises.writeFile(expectedFile, expectedOutput, 'utf-8'),
  ]);

  const runResult = await runInSandbox({
    cmd: checkerBin,
    args: [inputFile, actualFile, expectedFile],
    timeoutMs,
    memoryMb: 256,
    cwd: workDir,
    useUlimit: true,
  });

  return {
    accepted: runResult.exitCode === 0,
    checkerStderr: runResult.stderr,
  };
}

module.exports = { diffCheck, compileCustomChecker, runCustomCheck };
