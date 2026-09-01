const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `## 5. CONTEXT REGIONS (VISUAL READING MATERIAL)
ESOL exams rely on visual reading materials (posters, emails, notices). 
- Identify these reading materials and provide their bounding box coordinates.
- Coordinates (x, y, width, height) MUST be normalized from 0.0 to 1.0 relative to the page dimensions.
- Use a safe crop. Include enough surrounding content for context. Do not cut off text.
- Do NOT crop standard exam questions or unrelated admin material. Only crop the source/reading material.
- If a Task has no visual reading material, leave contextRegions empty.`;

const newStr = `## 5. CONTEXT REGIONS (VISUAL READING MATERIAL) - VERY IMPORTANT
For each Task/Section, identify the ACTUAL source/reading material (e.g. advertisement, poster, flyer, email, letter, notice, form, article, newspaper clipping, timetable, table, or other visually structured source).

BOUNDARY RULE:
The bounding box must start at the first visual content belonging to the source material and end at the last visual content belonging to that source.
Do NOT include:
- Task heading
- "Read the text..." instructions
- "Read the following..." instructions
- "Answer the questions..." instructions
- question text
- answer options outside the source
- page headers, footers, numbers
- candidate details, assessor instructions, marking info, unrelated whitespace.

CRITICAL DISTINCTION:
An exam instruction ABOVE a reading source is NOT part of the reading source. DO NOT INCLUDE IT IN THE CROP.
Example: "Read the following advertisement and answer questions 1-5." MUST be excluded.
IMPORTANT EXCEPTION: If text appears INSIDE the source itself, it must remain. (e.g. "From: John", "To: Mary", "Subject:" in an email, or a title on a poster). Distinguish between "exam instruction outside source" and "content that visually belongs to the source itself".

FULL-CONTEXT RULE:
Do not crop only the portion that contains the answer. The crop must contain the COMPLETE source material needed by the Task. Do not cut off source titles, headings, text blocks, tables, signatures, contact details, or footer content that belongs to the source.

SAFE BOUNDARIES & CONFIDENCE:
Prefer a slightly larger crop ONLY when necessary to avoid cutting off the source, but NO EXTERNAL EXAM CONTENT.
If the boundary between the exam instruction and the source is genuinely ambiguous, choose the most likely boundary, but set context confidence to LOW or MEDIUM. DO NOT GUESS AGGRESSIVELY.

MULTI-REGION SOURCES:
If a Task uses multiple separate source materials, return multiple contextRegions.

COORDINATE RULE:
Coordinates (x, y, width, height) MUST be normalized (0.0 to 1.0) describing the actual visible source boundary.
If a Task has no visual reading material, leave contextRegions empty.`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("Prompt patched!");
