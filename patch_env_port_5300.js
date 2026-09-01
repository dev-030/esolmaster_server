const fs = require('fs');
let code = fs.readFileSync('.env', 'utf8');
code = code.replace('PORT = 5301', 'PORT = 5300');
fs.writeFileSync('.env', code);
