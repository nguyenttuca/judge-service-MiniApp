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
 * Custom checker — compile & run a C++ checker program.
 * The checker receives three files via argv: input, contestant_output, expected_output.
 * Exit code 0 = AC, non-zero = WA.
 *
 * @param {object} opts
 * @param {string}  opts.checkerCode     — C++ source code of the checker
 * @param {string}  opts.inputData       — test input
 * @param {string}  opts.actualOutput    — contestant stdout
 * @param {string}  opts.expectedOutput  — expected output
 * @param {string}  opts.workDir         — working directory
 * @param {number}  opts.timeoutMs       — timeout for checker execution
 *
 * @returns {Promise<{ accepted: boolean, checkerStderr: string }>}
 */
async function customCheck(opts) {
  const {
    checkerCode,
    inputData,
    actualOutput,
    expectedOutput,
    workDir,
    timeoutMs = 10_000,
  } = opts;

  // Write checker source & data files
  const checkerSrc = path.join(workDir, 'checker.cpp');
  const checkerBin = path.join(workDir, 'checker');
  const inputFile = path.join(workDir, 'input.txt');
  const actualFile = path.join(workDir, 'actual.txt');
  const expectedFile = path.join(workDir, 'expected.txt');

  fs.writeFileSync(checkerSrc, checkerCode, 'utf-8');
  fs.writeFileSync(inputFile, inputData, 'utf-8');
  fs.writeFileSync(actualFile, actualOutput, 'utf-8');
  fs.writeFileSync(expectedFile, expectedOutput, 'utf-8');

  // Thêm code detect GCC giống hệt languages.js
  const PORTABLE_GCC_DIR = path.join(__dirname, '..', 'gcc-toolchain', 'bin');
  const portableGpp = path.join(PORTABLE_GCC_DIR, 'x86_64-linux-musl-g++');
  const gppCmd = fs.existsSync(portableGpp) ? portableGpp : 'g++';

  // Compile checker
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
      accepted: false,
      checkerStderr: `Checker compilation failed:\n${compileResult.stderr}`,
    };
  }

  // Run checker
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

module.exports = { diffCheck, customCheck };
