const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /## 5\. CONTEXT REGIONS \(VISUAL READING MATERIAL\) - VERY IMPORTANT[\s\S]*?(?=\n\$\{process\.env\.AI_PROVIDER)/;

const newStr = `## 5. CONTEXT REGIONS (VISUAL READING MATERIAL) - VERY IMPORTANT
ESOL papers enclose reading/context material inside a visible border, box, or frame. When the reading source is enclosed by a visible border, use the outer edges of that border as the authoritative context boundary.

1. INDEPENDENT EDGES: Return the 4 exact normalized boundary positions: left, top, right, bottom (from 0.0 to 1.0, origin: top-left).
2. DO NOT USE FIXED CROP SIZES: Different reading contexts have radically different heights and aspect ratios!
   - A short postcard (e.g. Task 1) is short: top is ~0.15, bottom is ~0.47 (height ~0.32).
   - A poster with images and bottom icons (e.g. Task 2) is medium: top is ~0.16, bottom is ~0.70 (height ~0.54).
   - A full-page formal letter (e.g. Task 3) is tall: top is ~0.15, bottom is ~0.86 (height ~0.71).
   NEVER return the same height or bottom edge for different types of contexts! Measure each context from where its border actually begins to where its border actually ends.
3. EXCLUDE EXAM INSTRUCTIONS: The instruction line "Read the text and answer the questions." sits around top: 0.10 to 0.14. The outer top border of the reading box starts below this instruction, around top: 0.15 - 0.17. NEVER set top above 0.15 if there is an instruction line above the box.
4. BOTTOM BOUNDARY (DO NOT CUT OFF): Look at the bottom of the reading box. Ensure your 'bottom' edge captures all content inside the box, including website links, contact numbers, sign-offs/signatures, and bottom icons/logos.
5. LEFT & RIGHT BOUNDARIES: The left edge is where the left border starts (~0.05 to 0.10). The right edge is where the right border ends (~0.88 to 0.94).
6. MULTIPLE CONTEXTS: If a page has separate bordered boxes (e.g. an email AND a timetable), return separate contextRegion items.`;

code = code.replace(regex, newStr);
fs.writeFileSync(file, code);
console.log("Patched prompt in task.service.ts!");
