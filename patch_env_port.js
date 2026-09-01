const fs = require('fs');
let code = fs.readFileSync('.env', 'utf8');
code = code.replace('PORT = 5300', 'PORT = 5301');
fs.writeFileSync('.env', code);
