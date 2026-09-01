const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `            if (r.x < 0 || r.y < 0 || r.width <= 0.01 || r.height <= 0.01 || r.x + r.width > 1.1 || r.y + r.height > 1.1) {
              section.validation.errors.push("Crop coordinates out of bounds or trivially small.");
              globalErrors.push("Crop coordinates out of bounds.");
              continue;
            }`;

const newStr = `            if (r.x < 0 || r.y < 0 || r.width <= 0.01 || r.height <= 0.01 || r.x + r.width > 1.1 || r.y + r.height > 1.1) {
              section.validation.errors.push("Crop coordinates out of bounds or trivially small.");
              globalErrors.push("Crop coordinates out of bounds.");
              continue;
            }
            if (r.confidence === 'LOW' || r.confidence === 'MEDIUM') {
              section.validation.reviewRequired.push(\`Context crop confidence is \${r.confidence}. Please review boundaries.\`);
            }`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("Backend confidence patched!");
