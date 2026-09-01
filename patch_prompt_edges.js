const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /## 5\. CONTEXT REGIONS \(VISUAL READING MATERIAL\) - VERY IMPORTANT[\s\S]*?DO NOT GUESS AGGRESSIVELY\./;

const newStr = `## 5. CONTEXT REGIONS (VISUAL READING MATERIAL) - VERY IMPORTANT
ESOL papers often enclose the reading/context material inside a visible border, box, or frame. When the reading source is enclosed by a visible border, use the outer edges of that border as the exact context boundary.

1. INDEPENDENT EDGES: Do not return width or height. Return the positions of the top, bottom, left, and right edges independently. Do not use a fixed crop size.
2. COORDINATES: Use normalized coordinates from 0.0 to 1.0. The origin is top-left. It MUST be true that: 0.0 <= left < right <= 1.0 AND 0.0 <= top < bottom <= 1.0.
3. EXCLUDE EXAM INSTRUCTIONS: Exclude exam instructions outside the source border. Text outside the source border (e.g. "Read the text and answer questions 1-5.") MUST NOT be included. Your top coordinate must start below this instruction.
4. INCLUDE SOURCE CONTENT: Include all content that belongs to the source inside the border. Anything visually belonging to the source INSIDE the border must remain (e.g. stamps, headers, signatures, logos).
5. DO NOT USE FIXED CROP SIZES: Every context has a completely different size/aspect ratio. Calculate each edge independently from its actual visual position. DO NOT reuse coordinates.
6. NO AUTOMATIC PADDING: Do not add large padding around the AI-selected context. The target is the exact source boundary.
7. MULTIPLE CONTEXTS: If a Task contains multiple separate source materials, return separate contextRegions. Do not create one giant rectangle.`;

if (regex.test(code)) {
  code = code.replace(regex, newStr);
  fs.writeFileSync(file, code);
  console.log("Replaced!");
} else {
  console.log("NOT FOUND!");
}
