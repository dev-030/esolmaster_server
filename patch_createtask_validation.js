const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `    if (dto.content && typeof dto.content === 'string' && dto.content.includes('data:image/')) {`;

const newStr = `    // Server-side guard to prevent silent saving of ERROR-level structural issues
    if (questions) {
      for (const q of questions) {
        if (!q.sectionId && !q.folderId) {
          throw new Error(\`Validation Error: Question "\${q.content}" has no assigned Section. Cannot save structural errors silently.\`);
        }
      }
    }

    if (dto.content && typeof dto.content === 'string' && dto.content.includes('data:image/')) {`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("createTask patched with validation!");
