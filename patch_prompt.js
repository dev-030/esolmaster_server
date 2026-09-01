const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const oldPromptBlock = `    const prompt = \`Extract all sections (Tasks) and questions from this ESOL examination paper.

## Rules:
1. Extract Sections: Title ("Task 1"), instruction, leave content empty.
2. Extract Questions: Convert all "INSTRUCTION" type questions (e.g., "Underline the postcode") into "QUESTION_ANSWER" (e.g., "What is the postcode? Write it below.").
3. Ignore candidate details, cover page info, headers, footers, marking grids, and invigilator instructions.
4. If it's a Tutor Copy with printed answers, set the correctIndex.

\${process.env.AI_PROVIDER !== 'openai' && rawText ? 'Exam Text:\\n' + rawText : ''}\`;`;

const newPromptBlock = `    const prompt = \`You are a highly accurate UK ESOL exam digitization assistant.
Your goal is to extract the logical structure of this paper, preserving meaning and distinguishing exam content from administrative noise.

## 1. DOCUMENT IDENTIFICATION
Determine the document type (e.g. Candidate Paper, Tutor Copy, Assessor Pack).

## 2. SECTION & QUESTION EXTRACTION
- Extract every Task/Section title (e.g. "Task 1") and its overall instruction.
- Extract every question. Preserve original numbering and order.
- Do NOT extract repeated headers, footers, page numbers, marking grids, or candidate detail boxes.

## 3. PAPER-TO-DIGITAL TRANSFORMATION (CRITICAL)
Convert physical interactions into digital-friendly questions while preserving the exact meaning.
- Physical: "Underline the postcode." -> Digital: "What is the postcode? Write it below."
- Physical: "Tick two boxes." -> Digital: "Which two options are correct?" (If options are present, use MCQ).
Do NOT invent fake MCQ options if none exist. Use QUESTION_ANSWER instead.

## 4. ANSWER EXTRACTION & VERIFICATION (THE 4 STATES)
For every question, determine the 'answerState':
- PRINTED: Use if an official answer is explicitly printed (e.g., in a Tutor Copy). This is the absolute truth.
- AI_SOLVED: If no answer is printed, read the source text and solve it. ONLY use evidence found in the document.
- UNKNOWN: If there is not enough evidence to solve it. NEVER GUESS.
Set 'confidence' (HIGH/MEDIUM/LOW) and provide a short 'evidence' string explaining where the answer was found.

## 5. CONTEXT REGIONS (VISUAL READING MATERIAL)
ESOL exams rely on visual reading materials (posters, emails, notices). 
- Identify these reading materials and provide their bounding box coordinates.
- Coordinates (x, y, width, height) MUST be normalized from 0.0 to 1.0 relative to the page dimensions.
- Use a safe crop. Include enough surrounding content for context. Do not cut off text.
- Do NOT crop standard exam questions. Only crop the source/reading material.
- If a Task has no visual reading material, leave contextRegions empty.

\${process.env.AI_PROVIDER !== 'openai' && rawText ? 'Exam Text:\\n' + rawText : ''}\`;`;

code = code.replace(oldPromptBlock, newPromptBlock);
fs.writeFileSync(file, code);
console.log("Prompt patched!");
