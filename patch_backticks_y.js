const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/Your \`y\` coordinate MUST/g, 'Your "y" coordinate MUST');
fs.writeFileSync(file, code);
