const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `3. EXCLUDE EXAM INSTRUCTIONS: The instruction line "Read the text and answer the questions." sits around top: 0.10 to 0.14. The outer top border of the reading box starts below this instruction, around top: 0.15 - 0.17. NEVER set top above 0.15 if there is an instruction line above the box.`;

const newStr = `3. EXCLUDE EXAM INSTRUCTIONS: The origin 0.0 is the very top of the page. The exam instruction ("Read the text and answer the questions.") sits at y = 0.10 to 0.13. The actual reading box starts LOWER down on the page, around top = 0.15 to 0.17. Therefore, your 'top' coordinate MUST be >= 0.15 (typically 0.15 - 0.17). DO NOT output top < 0.15 (such as 0.11 or 0.12) as that will capture the instruction text.`;

code = code.replace(target, newStr);
fs.writeFileSync(file, code);
