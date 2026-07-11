#!/usr/bin/env node
// -----------------------------------------------------------
// test/test-judge.js — Smoke-test the judge API locally.
// Start the server first:  npm start
// Then run:                 npm test
// -----------------------------------------------------------

const BASE = process.env.TEST_URL || 'http://localhost:3000';
const API_KEY = process.env.JUDGE_API_KEY || '';

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

function assert(condition, msg) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// ---- Test cases ----

async function testHealth() {
  console.log('\n=== GET /health ===');
  const { status, data } = await request('GET', '/health');
  assert(status === 200, `Status 200 (got ${status})`);
  assert(data.status === 'ok', 'status = ok');
  assert(typeof data.languages === 'object', 'languages object present');
  console.log('  Languages:', JSON.stringify(data.languages));
}

async function testCppAC() {
  console.log('\n=== C++ — A+B (expect AC) ===');
  const { status, data } = await request('POST', '/judge', {
    language: 'cpp',
    source_code: `
#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
    time_limit_ms: 2000,
    memory_limit_mb: 256,
    test_cases: [
      { input: '1 2\n', expected_output: '3\n' },
      { input: '10 20\n', expected_output: '30\n' },
      { input: '-5 5\n', expected_output: '0\n' },
    ],
  });
  assert(status === 200, `Status 200 (got ${status})`);
  assert(data.verdict === 'AC', `Verdict AC (got ${data.verdict})`);
  assert(data.test_results.length === 3, `3 test results (got ${data.test_results.length})`);
}

async function testCppCE() {
  console.log('\n=== C++ — Compile Error ===');
  const { status, data } = await request('POST', '/judge', {
    language: 'cpp',
    source_code: 'int main() { this is bad syntax }',
    time_limit_ms: 2000,
    memory_limit_mb: 256,
    test_cases: [{ input: '', expected_output: '' }],
  });
  assert(status === 200, `Status 200 (got ${status})`);
  assert(data.verdict === 'CE', `Verdict CE (got ${data.verdict})`);
  assert(data.compile_output.length > 0, 'Compile output present');
}

async function testCppWA() {
  console.log('\n=== C++ — Wrong Answer (short-circuit) ===');
  const { status, data } = await request('POST', '/judge', {
    language: 'cpp',
    source_code: `
#include <iostream>
int main() { std::cout << 42 << std::endl; return 0; }`,
    time_limit_ms: 2000,
    memory_limit_mb: 256,
    test_cases: [
      { input: '', expected_output: '1\n' },
      { input: '', expected_output: '2\n' },
    ],
  });
  assert(status === 200, `Status 200 (got ${status})`);
  assert(data.verdict === 'WA', `Verdict WA (got ${data.verdict})`);
  assert(data.test_results.length === 1, `Short-circuit: 1 result (got ${data.test_results.length})`);
}

async function testCppTLE() {
  console.log('\n=== C++ — Time Limit Exceeded ===');
  const { status, data } = await request('POST', '/judge', {
    language: 'cpp',
    source_code: `
#include <iostream>
int main() { while(true); return 0; }`,
    time_limit_ms: 500,
    memory_limit_mb: 256,
    test_cases: [{ input: '', expected_output: '' }],
  });
  assert(status === 200, `Status 200 (got ${status})`);
  assert(data.verdict === 'TLE', `Verdict TLE (got ${data.verdict})`);
}

async function testCppRE() {
  console.log('\n=== C++ — Runtime Error ===');
  const { status, data } = await request('POST', '/judge', {
    language: 'cpp',
    source_code: `
#include <cstdlib>
int main() { return 1; }`,
    time_limit_ms: 2000,
    memory_limit_mb: 256,
    test_cases: [{ input: '', expected_output: '' }],
  });
  assert(status === 200, `Status 200 (got ${status})`);
  assert(data.verdict === 'RE', `Verdict RE (got ${data.verdict})`);
}

async function testCAC() {
  console.log('\n=== C — A+B (expect AC) ===');
  const { status, data } = await request('POST', '/judge', {
    language: 'c',
    source_code: `
#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`,
    time_limit_ms: 2000,
    memory_limit_mb: 256,
    test_cases: [
      { input: '3 7\n', expected_output: '10\n' },
    ],
  });
  assert(status === 200, `Status 200 (got ${status})`);
  assert(data.verdict === 'AC', `Verdict AC (got ${data.verdict})`);
}

async function testPythonAC() {
  console.log('\n=== Python — A+B (expect AC) ===');
  const { status, data } = await request('POST', '/judge', {
    language: 'python',
    source_code: `a, b = map(int, input().split())
print(a + b)`,
    time_limit_ms: 5000,
    memory_limit_mb: 256,
    test_cases: [
      { input: '100 200\n', expected_output: '300\n' },
    ],
  });
  assert(status === 200, `Status 200 (got ${status})`);
  assert(data.verdict === 'AC', `Verdict AC (got ${data.verdict})`);
}

async function testPythonRE() {
  console.log('\n=== Python — Syntax Error → RE ===');
  const { status, data } = await request('POST', '/judge', {
    language: 'python',
    source_code: 'def broken(:\n  pass',
    time_limit_ms: 5000,
    memory_limit_mb: 256,
    test_cases: [{ input: '', expected_output: '' }],
  });
  assert(status === 200, `Status 200 (got ${status})`);
  assert(data.verdict === 'RE', `Verdict RE (got ${data.verdict})`);
}

async function testRunAllTests() {
  console.log('\n=== run_all_tests=true (no short-circuit) ===');
  const { status, data } = await request('POST', '/judge', {
    language: 'cpp',
    source_code: `
#include <iostream>
int main() { std::cout << 42 << std::endl; return 0; }`,
    time_limit_ms: 2000,
    memory_limit_mb: 256,
    run_all_tests: true,
    test_cases: [
      { input: '', expected_output: '1\n' },
      { input: '', expected_output: '42\n' },
      { input: '', expected_output: '3\n' },
    ],
  });
  assert(status === 200, `Status 200 (got ${status})`);
  assert(data.test_results.length === 3, `All 3 tests ran (got ${data.test_results.length})`);
  assert(data.test_results[0].verdict === 'WA', 'Test 0 = WA');
  assert(data.test_results[1].verdict === 'AC', 'Test 1 = AC');
  assert(data.test_results[2].verdict === 'WA', 'Test 2 = WA');
}

async function testUnsupportedLang() {
  console.log('\n=== Unsupported language ===');
  const { status, data } = await request('POST', '/judge', {
    language: 'brainfuck',
    source_code: '++++.',
    time_limit_ms: 1000,
    memory_limit_mb: 256,
    test_cases: [{ input: '', expected_output: '' }],
  });
  assert(status === 400, `Status 400 (got ${status})`);
}

// ---- Runner ----

(async () => {
  console.log('Judge Service Test Suite');
  console.log(`Target: ${BASE}`);
  console.log('---');

  await testHealth();
  await testCppAC();
  await testCppCE();
  await testCppWA();
  await testCppTLE();
  await testCppRE();
  await testCAC();
  await testPythonAC();
  await testPythonRE();
  await testRunAllTests();
  await testUnsupportedLang();

  console.log('\n--- Done ---');
})();
