const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const oldStr = `required: ["sectionIndex", "type", "content", "marks", "answerState", "confidence", "evidence"],
                additionalProperties: false
              }`;

const newStr = `required: ["sectionIndex", "type", "content", "marks", "answerState", "confidence", "evidence", "config"],
                additionalProperties: false
              }`;

code = code.replace(oldStr, newStr);

fs.writeFileSync(file, code);
console.log("Schema 2 fixed!");
