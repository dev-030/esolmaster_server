const fs = require('fs');
let code = fs.readFileSync('run_benchmark.ts', 'utf8');

const target = `                 console.log(\`  x: \${r.x} y: \${r.y} w: \${r.width} h: \${r.height}\`);`;
const newStr = `                 const width = (r.right || 0) - (r.left || 0);
                 const height = (r.bottom || 0) - (r.top || 0);
                 console.log(\`  page: \${r.page}\\n  left: \${r.left}\\n  top: \${r.top}\\n  right: \${r.right}\\n  bottom: \${r.bottom}\\n  derivedWidth: \${width}\\n  derivedHeight: \${height}\`);`;

code = code.replace(target, newStr);

const regex2 = /const targetFiles = files\.filter\([^;]+\);\s*for \(const filePath of targetFiles\)/;
code = code.replace(regex2, "for (const filePath of files)");

fs.writeFileSync('run_benchmark.ts', code);
