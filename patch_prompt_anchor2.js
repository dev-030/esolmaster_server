const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `6. INCLUDE THE COMPLETE BORDER: Prefer the crop to include the full border itself. Do not cut into the border.`;

const newStr = `6. (Rule removed to prioritize text-anchor bounds)`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("Rule 6 removed!");
