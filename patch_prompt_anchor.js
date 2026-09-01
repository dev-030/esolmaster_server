const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `1. FOLLOW THE ACTUAL BORDER: When a source is surrounded by a visible border, use that border as the crop boundary (top, bottom, left, right). The crop must include the entire bordered source and the border itself.`;

const newStr = `1. FOLLOW THE ACTUAL BORDER: When a source is surrounded by a visible border, use that border as the crop boundary. The crop must include the entire bordered source and the border itself.
**CRITICAL TOP BOUNDARY RULE:** AI models often struggle to find exact graphical lines. To ensure you do NOT accidentally include the "Read the text..." instruction above the border, find the VERY FIRST WORD of the actual source content (e.g. the first address line, "Dear", or the title). Your \`y\` coordinate MUST begin EXACTLY at that first source word, intentionally shaving off the top of the border if necessary to avoid the instruction. Do NOT include any space above the first word of the source.`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("Prompt patched with text anchor rule!");
