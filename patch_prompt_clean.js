const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /## 5\. CONTEXT REGIONS \(VISUAL READING MATERIAL\) - VERY IMPORTANT[\s\S]*?(?=\n\$\{process\.env\.AI_PROVIDER)/;

const newSection5 = `## 5. CONTEXT REGIONS (VISUAL READING MATERIAL) - VERY IMPORTANT
Inspect THIS specific page and determine the real visual boundaries of THIS reading source. When the reading source is enclosed by a visible border, box, or frame, use the OUTER EDGES of that actual border as the authoritative context boundary.

1. INDEPENDENT EDGES: Return the 4 exact normalized boundary positions: left, top, right, bottom (from 0.0 to 1.0, with origin (0.0, 0.0) at the top-left corner of the page).
   - left: Where the reading source / border starts on the left.
   - top: Where the reading source / border starts at the top.
   - right: Where the reading source / border ends on the right.
   - bottom: Where the reading source / border ends at the bottom.
   It must strictly hold that: 0.0 <= left < right <= 1.0 AND 0.0 <= top < bottom <= 1.0.

2. NO FIXED CROP SIZES OR ASSUMPTIONS: Different context regions may have completely different widths, heights, aspect ratios, and positions on the page. Each region must be independently measured from the actual page. Never infer coordinates from typical layouts, and never reuse coordinates across different tasks.

3. EXCLUDE EXTERNAL EXAM INSTRUCTIONS: Text located outside and above the reading box (such as "Read the text and answer the questions.", "Task 1 (Guide time...)", etc.) is exam instruction and MUST NOT be included in the crop. Your top edge must start at the outer top border of the reading source itself, below any external instructions.

4. PRESERVE ALL CONTENT INSIDE THE SOURCE: Anything physically inside the context border belongs to the reading source and MUST be included in the crop. Do not remove or crop out titles, headings, From/To/Subject headers, dates, signatures, addresses, contact details, footers, logos, tables, or images that belong to the source.

5. COMPLETE SOURCE BOUNDARY: The crop must capture the COMPLETE source from its visual start to its visual end. Do NOT cut off the bottom of letters (signatures), the bottom of posters (icons/links), or the sides of addresses. When a border exists, capture the complete bordered area.

6. MULTIPLE CONTEXTS: If a Task contains multiple separate bordered sources, return separate contextRegions entries. Do not combine unrelated sources into one large rectangle.

7. CONFIDENCE: If the visual boundary is ambiguous or difficult to determine, choose the most likely complete source boundary and set confidence to "MEDIUM" or "LOW".`;

if (!regex.test(code)) {
  console.error("Regex did not match Section 5 in task.service.ts");
  process.exit(1);
}

code = code.replace(regex, newSection5);
fs.writeFileSync(file, code);
console.log("Successfully updated Section 5 in task.service.ts without hardcoded numbers!");
