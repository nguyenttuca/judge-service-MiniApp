const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const URL = 'https://musl.cc/x86_64-linux-musl-cross.tgz';
const ARCHIVE = 'gcc.tgz';
const TARGET_DIR = path.join(__dirname, 'gcc-toolchain');

console.log('=============================================');
console.log(' Bắt đầu tải bộ biên dịch C++ (GCC Portable)');
console.log('=============================================');

if (fs.existsSync(TARGET_DIR)) {
    console.log('✅ Bộ biên dịch đã tồn tại. Không cần tải lại.');
    process.exit(0);
}

try {
    console.log('[1/3] Đang tải file nén (~135MB)... Quá trình này có thể mất 1-2 phút.');
    execSync(`curl -L ${URL} -o ${ARCHIVE}`, { stdio: 'inherit' });

    console.log('[2/3] Đang giải nén file...');
    execSync(`tar -xzf ${ARCHIVE}`, { stdio: 'inherit' });

    console.log('[3/3] Đang thiết lập thư mục...');
    fs.renameSync('x86_64-linux-musl-cross', TARGET_DIR);
    fs.unlinkSync(ARCHIVE);

    console.log('=============================================');
    console.log('🎉 THÀNH CÔNG! Đã cài đặt xong C++ (g++)');
    console.log('Hãy bấm Restart lại server để áp dụng.');
    console.log('=============================================');
} catch (error) {
    console.error('❌ Cài đặt thất bại:', error.message);
    process.exit(1);
}
