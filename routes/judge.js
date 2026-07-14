// -----------------------------------------------------------
// routes/judge.js — POST /judge  &  GET /health
// -----------------------------------------------------------
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const pLimitModule = require('p-limit');
const pLimit = pLimitModule.default || pLimitModule;

const { getLanguage, getLanguageStatus } = require('../core/languages');
const { runInSandbox } = require('../core/sandbox');
const { compileSource } = require('../core/compiler');
const { diffCheck, compileCustomChecker, runCustomCheck } = require('../core/checker');

const router = express.Router();

// ---------------------------------------------------------------
// Concurrency limiter — simple async semaphore
// ---------------------------------------------------------------
const MAX_CONCURRENT = parseInt(process.env.JUDGE_MAX_CONCURRENT, 10) || os.cpus().length;
let activeJobs = 0;
const waitQueue = [];

function acquireSlot() {
  return new Promise((resolve) => {
    if (activeJobs < MAX_CONCURRENT) {
      activeJobs++;
      return resolve();
    }
    waitQueue.push(resolve);
  });
}

function releaseSlot() {
  if (waitQueue.length > 0) {
    const next = waitQueue.shift();
    next(); // activeJobs stays the same — slot transferred
  } else {
    activeJobs--;
  }
}

// ---------------------------------------------------------------
// Helper: truncate string
// ---------------------------------------------------------------
const MAX_OUTPUT_LEN = 4096;
function truncate(str, limit = MAX_OUTPUT_LEN) {
  if (str.length <= limit) return str;
  return str.slice(0, limit) + `\n... [truncated, ${str.length} bytes total]`;
}

// ---------------------------------------------------------------
// Helper: determine overall verdict from test results
// ---------------------------------------------------------------
function overallVerdict(testResults) {
  // Sort test results by index since they might finish out of order
  testResults.sort((a, b) => a.test_index - b.test_index);
  for (const t of testResults) {
    if (t.verdict !== 'AC') return t.verdict;
  }
  return 'AC';
}

// ---------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    languages: getLanguageStatus(),
    active_jobs: activeJobs,
    max_concurrent: MAX_CONCURRENT,
  });
});

// ---------------------------------------------------------------
// POST /judge
// ---------------------------------------------------------------
router.post('/judge', async (req, res) => {
  // ---- 1. Validate request ----
  const {
    language,
    source_code,
    time_limit_ms = 1000,
    memory_limit_mb = 256,
    test_cases,
    checker_type = 'diff',
    custom_checker_code,
    run_all_tests = false,
  } = req.body;

  if (!language || !source_code || !Array.isArray(test_cases) || test_cases.length === 0) {
    return res.status(400).json({
      error: 'Missing required fields: language, source_code, test_cases (non-empty array)',
    });
  }

  // Source size guard (100 MB)
  const sourceBytes = Buffer.byteLength(source_code, 'utf-8');
  if (sourceBytes > 100 * 1024 * 1024) {
    return res.status(400).json({
      error: `Source code too large (${sourceBytes} bytes). Maximum is 100MB.`,
    });
  }

  const lang = getLanguage(language);
  if (!lang) {
    return res.status(400).json({
      error: `Unknown language "${language}". Supported: cpp, c, python, pascal`,
    });
  }
  if (!lang.available) {
    return res.status(400).json({
      error: `Language "${language}" is not available on this judge instance (compiler/runtime not found).`,
    });
  }

  if (checker_type === 'custom' && !custom_checker_code) {
    return res.status(400).json({
      error: 'checker_type is "custom" but custom_checker_code is missing.',
    });
  }

  // ---- 2. Acquire concurrency slot ----
  await acquireSlot();

  // ---- 3. Prepare workspace ----
  const jobId = uuidv4();
  const tmpRoot = path.join(__dirname, '..', 'tmp');
  const workDir = path.join(tmpRoot, jobId);

  try {
    await fs.promises.mkdir(workDir, { recursive: true });

    // Decode source (support base64 or plain text)
    let sourceText = source_code;
    if (isBase64(source_code)) {
      sourceText = Buffer.from(source_code, 'base64').toString('utf-8');
    }

    const sourceFile = path.join(workDir, `solution${lang.ext}`);
    const binaryFile = path.join(workDir, 'solution');
    await fs.promises.writeFile(sourceFile, sourceText, 'utf-8');

    // ---- 4. Compile Source ----
    const compileResult = await compileSource(lang, sourceFile, binaryFile, workDir);
    if (!compileResult.success) {
      return res.json({
        verdict: 'CE',
        compile_output: truncate(compileResult.compileOutput),
        test_results: [],
      });
    }

    // ---- 4.5 Compile Custom Checker (if needed) ----
    let compiledCheckerBin = null;
    if (checker_type === 'custom') {
      const checkerCompile = await compileCustomChecker({
        checkerCode: custom_checker_code,
        workDir,
      });
      if (!checkerCompile.success) {
        return res.json({
          verdict: 'CE',
          compile_output: truncate(checkerCompile.checkerStderr),
          test_results: [],
        });
      }
      compiledCheckerBin = checkerCompile.checkerBin;
    }

    // ---- 5. Run test cases ----
    const testResults = [];
    
    // Concurrency limit for test cases inside a job
    const limitTestCases = pLimit(MAX_CONCURRENT); // use up to MAX_CONCURRENT tests at once
    let failed = false;

    const testPromises = test_cases.map((tc, i) => limitTestCases(async () => {
      // Short-circuit check
      if (failed && !run_all_tests) return;

      const { cmd, args } = lang.compile
        ? lang.run(binaryFile)          // compiled → run binary
        : lang.run(sourceFile);         // interpreted → run source

      const result = await runInSandbox({
        cmd,
        args,
        stdin: tc.input || '',
        timeoutMs: time_limit_ms,
        memoryMb: memory_limit_mb,
        cwd: workDir,
        useUlimit: true,
      });

      // Determine per-test verdict
      let verdict;
      if (result.ole) {
        verdict = 'OLE';
      } else if (result.timedOut) {
        verdict = 'TLE';
      } else if (result.oom) {
        verdict = 'MLE';
      } else if (result.exitCode !== 0) {
        verdict = 'RE';
      } else {
        // Check output
        let accepted;
        if (checker_type === 'custom') {
          const cr = await runCustomCheck({
            checkerBin: compiledCheckerBin,
            inputData: tc.input || '',
            actualOutput: result.stdout,
            expectedOutput: tc.expected_output || '',
            workDir,
            testIndex: i,
            timeoutMs: 10_000,
          });
          accepted = cr.accepted;
        } else {
          accepted = diffCheck(result.stdout, tc.expected_output || '');
        }
        verdict = accepted ? 'AC' : 'WA';
      }

      if (verdict !== 'AC') {
        failed = true;
      }

      testResults.push({
        test_index: i,
        verdict,
        time_ms: result.timeMs,
        memory_kb: result.memoryKb,
        stdout: truncate(result.stdout),
        stderr: truncate(result.stderr),
      });
    }));

    await Promise.all(testPromises);

    return res.json({
      verdict: overallVerdict(testResults),
      compile_output: truncate(compileResult.compileOutput),
      test_results: testResults,
    });
  } catch (err) {
    console.error(`[JUDGE] Job ${jobId} failed:`, err);
    return res.status(500).json({
      verdict: 'SYSTEM_ERROR',
      compile_output: '',
      test_results: [],
    });
  } finally {
    // ---- 6. Cleanup workspace ----
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    } catch {
      console.warn(`[JUDGE] Failed to clean up ${workDir}`);
    }
    releaseSlot();
  }
});

// ---------------------------------------------------------------
// Heuristic base64 detection
// ---------------------------------------------------------------
function isBase64(str) {
  if (str.length < 8) return false;
  // Fast regex to verify valid base64 (allows whitespace/newlines)
  return /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/.test(str.replace(/[\s\r\n]/g, ''));
}

module.exports = router;
