const { runInSandbox } = require('./core/sandbox');
async function run() {
  const res = await runInSandbox({
    cmd: './test_bin',
    args: [],
    stdin: '5\n',
    timeoutMs: 1000,
  });
  console.log(res);
}
run();
