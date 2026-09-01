const fs = require('fs');
const file = 'src/task/task.controller.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(`// @UseGuards(AuthGuard('jwt'), RolesGuard)`, `@UseGuards(AuthGuard('jwt'), RolesGuard)`);

fs.writeFileSync(file, code);
console.log("Auth restored!");
