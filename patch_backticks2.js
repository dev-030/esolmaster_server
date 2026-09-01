const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace("create separate `contextRegions`. Do not combine", 'create separate "contextRegions". Do not combine');
fs.writeFileSync(file, code);
