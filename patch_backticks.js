const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/create separate \`contextRegions\`\\./g, 'create separate "contextRegions".');
fs.writeFileSync(file, code);
