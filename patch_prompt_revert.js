const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `1. FOLLOW THE ACTUAL BORDER: When a source is surrounded by a visible border, use that border as the crop boundary. The crop must include the entire bordered source and the border itself.
**CRITICAL TOP BOUNDARY RULE:** AI models often struggle to find exact graphical lines. To ensure you do NOT accidentally include the "Read the text..." instruction above the border, find the VERY FIRST WORD of the actual source content (e.g. the first address line, "Dear", or the title). Your "y" coordinate MUST begin EXACTLY at that first source word, intentionally shaving off the top of the border if necessary to avoid the instruction. Do NOT include any space above the first word of the source.
2. DO NOT USE FIXED CROP SIZES: Every context has a different size/aspect ratio. DO NOT assume width=0.8/height=0.6. Calculate each region independently from its actual visual dimensions.
3. CROP TO THE SOURCE, NOT THE QUESTION AREA: The crop should contain ONLY the complete reading/source material. Do not enlarge the crop just because questions are below it.
4. OUTSIDE-THE-BORDER TEXT MUST BE EXCLUDED: Text immediately above the box (e.g. "Read the text and answer the questions.") MUST remain outside the crop. An instruction ABOVE a reading source is NOT part of the reading source.
5. CONTENT INSIDE THE BORDER MUST BE INCLUDED: Titles, headings, dates, signatures, tables physically INSIDE the context border belong to the context and must remain.
6. (Rule removed to prioritize text-anchor bounds)`;

const newStr = `1. FOLLOW THE ACTUAL BORDER: When a source is surrounded by a visible border, use that border as the exact crop boundary (top, bottom, left, right). The crop must include the entire bordered source and the border itself. DO NOT cut off the top or bottom of the source.
2. DO NOT USE FIXED CROP SIZES: Every context has a different size/aspect ratio. Calculate each region independently from its actual visual dimensions.
3. OUTSIDE-THE-BORDER TEXT MUST BE EXCLUDED: Text immediately above the box (e.g. "Read the text and answer the questions.", "Task 1", etc.) MUST remain absolutely outside the crop. 
4. CRITICAL TOP BOUNDARY CALCULATION: To exclude the instruction text but keep the full source, place your \`y\` coordinate precisely between the bottom of the instruction text and the top of the visual border. DO NOT chop off the top of the graphical source (like stamps, logos, or return addresses).
5. CONTENT INSIDE THE BORDER MUST BE INCLUDED: Titles, headings, dates, signatures, tables physically INSIDE the context border belong to the context and must remain.
6. INCLUDE THE COMPLETE BORDER: The crop must include the full border itself without cutting into the graphical box.`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("Prompt reverted to full box with explicit top boundary!");
