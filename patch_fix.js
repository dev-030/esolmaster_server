const fs = require('fs');
let code = fs.readFileSync('run_benchmark.ts', 'utf8');

const regex = /const targetFiles = files\.filter\([^;]+\);\s*for \(const filePath of targetFiles\)/;
if (regex.test(code)) {
    code = code.replace(regex, "const targetFiles = files.filter(f => f.includes('E1 ESOL Reading Candidate Paper PPA'));\n  for (const filePath of targetFiles)");
} else {
    code = code.replace("for (const filePath of files)", "const targetFiles = files.filter(f => f.includes('E1 ESOL Reading Candidate Paper PPA'));\n  for (const filePath of targetFiles)");
}

fs.writeFileSync('run_benchmark.ts', code);
