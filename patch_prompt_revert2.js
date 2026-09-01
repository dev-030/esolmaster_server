const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/place your \`y\` coordinate/g, 'place your "y" coordinate');
fs.writeFileSync(file, code);
