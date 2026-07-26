const { spawn } = require('child_process');
const fs = require('fs');

const fd = fs.openSync('test_fd.js', 'r');
const child = spawn('cat', [], { stdio: [fd, 'pipe', 'pipe'] });
fs.closeSync(fd);

child.stdout.on('data', d => process.stdout.write(d.toString().substring(0, 50)));
