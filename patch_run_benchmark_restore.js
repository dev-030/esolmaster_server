const fs = require('fs');
let code = fs.readFileSync('run_benchmark.ts', 'utf8');

const regex = /const targetFiles = files\.filter\([^;]+\);\s*for \(const filePath of targetFiles\)/;
code = code.replace(regex, "for (const filePath of files)");

fs.writeFileSync('run_benchmark.ts', code);
