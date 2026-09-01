const fs = require('fs');
let code = fs.readFileSync('run_benchmark.ts', 'utf8');

const targetStr = `  for (const filePath of files) {`;
const newStr = `  const targetFiles = files.filter(f => f.includes('E1 ESOL Reading Candidate Paper PPA'));
  for (const filePath of targetFiles) {`;

code = code.replace(targetStr, newStr);
fs.writeFileSync('run_benchmark.ts', code);
