const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `CRITICAL DISTINCTION:
An exam instruction ABOVE a reading source is NOT part of the reading source. DO NOT INCLUDE IT IN THE CROP.
Example: "Read the following advertisement and answer questions 1-5." MUST be excluded.
IMPORTANT EXCEPTION: If text appears INSIDE the source itself, it must remain. (e.g. "From: John", "To: Mary", "Subject:" in an email, or a title on a poster). Distinguish between "exam instruction outside source" and "content that visually belongs to the source itself".

FULL-CONTEXT RULE:`;

const newStr = `CRITICAL DISTINCTION:
An exam instruction ABOVE a reading source is NOT part of the reading source. DO NOT INCLUDE IT IN THE CROP.
Example: "Read the following advertisement and answer questions 1-5." MUST be excluded.
IMPORTANT EXCEPTION: If text appears INSIDE the source itself, it must remain. (e.g. "From: John", "To: Mary", "Subject:" in an email, or a title on a poster). Distinguish between "exam instruction outside source" and "content that visually belongs to the source itself".

THE DRAWN BORDER RULE (CRITICAL):
ESOL exams frequently draw a literal black border line (a rectangular box) entirely around the reading source to separate it from the exam instructions. 
If there is a printed border or graphical box enclosing the source material:
1. Your crop coordinates MUST perfectly snap to that drawn border.
2. The drawn border is the ABSOLUTE visual boundary of the source.
3. Everything OUTSIDE the drawn border (like "Read the text...") MUST be excluded.
4. Everything INSIDE the drawn border MUST be included.

FULL-CONTEXT RULE:`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("Border rule patched!");
