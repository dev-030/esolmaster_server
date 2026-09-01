const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `## 5. CONTEXT REGIONS (VISUAL READING MATERIAL) - VERY IMPORTANT
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

THE DRAWN BORDER RULE (CRITICAL):
ESOL exams frequently draw a literal black border line (a rectangular box) entirely around the reading source to separate it from the exam instructions. 
If there is a printed border or graphical box enclosing the source material:
1. Your crop coordinates MUST perfectly snap to that drawn border.
2. The drawn border is the ABSOLUTE visual boundary of the source.
3. Everything OUTSIDE the drawn border (like "Read the text...") MUST be excluded.
4. Everything INSIDE the drawn border MUST be included.

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

const newStr = `## 5. CONTEXT REGIONS (VISUAL READING MATERIAL) - VERY IMPORTANT
ESOL papers often enclose the reading/context material inside a visible border/box/frame. The crop must follow the ACTUAL outer boundary of that bordered context, NOT an estimated fixed-size rectangle.

1. FOLLOW THE ACTUAL BORDER: When a source is surrounded by a visible border, use that border as the crop boundary (top, bottom, left, right). The crop must include the entire bordered source and the border itself.
2. DO NOT USE FIXED CROP SIZES: Every context has a different size/aspect ratio. DO NOT assume width=0.8/height=0.6. Calculate each region independently from its actual visual dimensions.
3. CROP TO THE SOURCE, NOT THE QUESTION AREA: The crop should contain ONLY the complete reading/source material. Do not enlarge the crop just because questions are below it.
4. OUTSIDE-THE-BORDER TEXT MUST BE EXCLUDED: Text immediately above the box (e.g. "Read the text and answer the questions.") MUST remain outside the crop. An instruction ABOVE a reading source is NOT part of the reading source.
5. CONTENT INSIDE THE BORDER MUST BE INCLUDED: Titles, headings, dates, signatures, tables physically INSIDE the context border belong to the context and must remain.
6. INCLUDE THE COMPLETE BORDER: Prefer the crop to include the full border itself. Do not cut into the border.
7. DO NOT INCLUDE EXTERNAL WHITESPACE: Do not add a large margin around the bordered source. The preferred result is the exact source boundary plus a tiny tolerance if required to prevent clipping. NO EXTERNAL EXAM CONTENT.
8. PAGE-SPECIFIC BOUNDING BOX: Coordinates must describe the actual context on THAT page. Do not reuse a previous context's coordinates. Every region must be independently detected.
9. MULTIPLE CONTEXTS: If a page contains several separate bordered contexts, create separate \`contextRegions\`. Do not combine them into one large rectangle.
10. CONTEXT WITHOUT A BORDER: If genuinely no border exists, determine its true visual boundary from the source content itself. But when a visible border exists, prefer the border as the authoritative boundary.

COORDINATE RULE: Coordinates (x, y, width, height) MUST be normalized (0.0 to 1.0).
CONFIDENCE: If the boundary between instruction and source is genuinely ambiguous, choose the most likely boundary, but set context confidence to LOW or MEDIUM. DO NOT GUESS AGGRESSIVELY.`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("Prompt patched with strict border rules!");
