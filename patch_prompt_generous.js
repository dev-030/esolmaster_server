const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /--- CONTEXT REGIONS ---[\s\S]*?(?=\n--- QUESTIONS ---)/;

const newStr = `--- CONTEXT REGIONS ---
You must identify the visual bounds of the reading material.
1. EXCLUDE TOP INSTRUCTIONS: Look at the text "Read the text and answer the questions." Your \`y\` coordinate MUST begin below this text.
2. CAPTURE THE FULL WIDTH: ESOL contexts span the whole page width. Your \`x\` should usually be 0.05 and \`width\` should be 0.90 to ensure you never cut off right-aligned text like addresses.
3. CAPTURE THE FULL HEIGHT: Do not cut off the bottom of the source. Look for the very bottom element of the box (e.g., website links, blue icons, or the bottom border line) and ensure your \`height\` extends past it.
4. BE GENEROUS: It is a critical failure to cut off any part of the actual source material. When in doubt, make the \`height\` and \`width\` larger.`;

code = code.replace(regex, newStr);
fs.writeFileSync(file, code);
