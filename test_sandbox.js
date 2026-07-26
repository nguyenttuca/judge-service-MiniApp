const { runInSandbox } = require('./core/sandbox');
async function run() {
  const res = await runInSandbox({
    cmd: '/bin/echo',
    args: ['hello'],
    timeoutMs: 2000,
  });
  console.log(res.timeMs, res.memoryKb);
}
run();
