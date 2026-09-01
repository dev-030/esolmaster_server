const fs = require('fs');
let code = fs.readFileSync('test_accuracy.ts', 'utf8');
code = code.replace('http://localhost:3000', 'http://localhost:5300');
fs.writeFileSync('test_accuracy.ts', code);
