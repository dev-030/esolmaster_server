const fs = require('fs');
const path = './src/task/task.service.ts';
let code = fs.readFileSync(path, 'utf8');

const newPrompt = `You are an expert ESOL teacher extracting an exam paper into JSON.
CONTEXT: These are official UK English ESOL (English for Speakers of Other Languages) Skills for Life examination papers. The text may come from various UK awarding bodies such as Ascentis, ESB (English Speaking Board), Gateway, or Trinity. The papers cover levels from Entry 1 to Level 2. The text may contain Adult ESOL Core Curriculum references (e.g., Rt/E1.1a) which are often found in Tutor Copies. Please process the text keeping this context in mind to accurately identify exam tasks, question formats, and answer keys.

We have provided you with the OCR text of the exam paper.

We need two arrays in the root object: "sections" and "questions".

1. "sections": These represent the main tasks (e.g. "Task 1", "Task 2").
Do NOT extract the reading passages or context text for these sections. The user will manually attach screenshots of the reading passages later.
"sections" should be an array of objects matching:
{
  "id": "generate-a-unique-uuid-here",
  "title": "Task 1 - Reading",
  "instruction": "Read the text and answer the questions.",
  "content": ""
}

2. "questions": Extract all the actual questions the student must answer.

CRITICAL CLEANUP RULES:
- Strip leading question numbers (e.g. remove "7 " or "Q1." from the start of the question text).
- Preserve all special symbols (£, $, math signs) exactly as they appear.
- Determine the question type from the source text and assign the correct "type" enum:
  - If the text has "True" and "False" options (e.g. "Is this true or false?"), set "type": "TRUE_FALSE".
  - If the text provides multiple choices (like a, b, c, d) and asks to "Tick one box" or "Circle the letter", set "type": "MCQ". Do NOT include the option letters (a, b, c) in the extracted options array.
  - If there is a blank space or line in the middle of a sentence for the student to fill in (e.g., "The weather is _______ today."), set "type": "GAP_FILL".
  - If the text asks the student to do something on the paper like "Underline the postcode", "Circle the word", set "type": "INSTRUCTION".
  - If it is an open question where the student must write their own text answer on a line (e.g. "What house number does Jane live at? _______"), set "type": "QUESTION_ANSWER" and omit the "config" property.

"questions" should be an array of objects.
For MCQ questions, use this format:
{
  "id": "generate-a-unique-uuid-here",
  "sectionId": "the-uuid-of-the-section-this-belongs-to",
  "type": "MCQ",
  "content": "<p>The question text</p>",
  "marks": 1,
  "config": {
    "options": ["Option 1", "Option 2"],
    "correctIndex": 0
  }
}

For TRUE_FALSE questions, use this format:
{
  "id": "generate-a-unique-uuid-here",
  "sectionId": "the-uuid-of-the-section-this-belongs-to",
  "type": "TRUE_FALSE",
  "content": "<p>The statement text (e.g. Maria is buying a dress.)</p>",
  "marks": 1,
  "config": {
    "options": ["True", "False"],
    "correctIndex": 0
  }
}

For GAP_FILL questions, use this format:
{
  "id": "generate-a-unique-uuid-here",
  "sectionId": "the-uuid-of-the-section-this-belongs-to",
  "type": "GAP_FILL",
  "content": "<p>The sentence with the _____ gap.</p>",
  "marks": 1,
  "config": {
    "options": ["Option 1", "Option 2"] // ONLY IF OPTIONS ARE PROVIDED in the text
  }
}

For QUESTION_ANSWER (open-ended short answers) or INSTRUCTION, use this format:
{
  "id": "generate-a-unique-uuid-here",
  "sectionId": "the-uuid-of-the-section-this-belongs-to",
  "type": "QUESTION_ANSWER", // or "INSTRUCTION"
  "content": "<p>The question or instruction text</p>",
  "marks": 1
}

Exam Text:
\${rawText}

Format as strict JSON without any markdown code blocks.`;

code = code.replace(/const prompt = `[\s\S]*?Format as strict JSON without any markdown code blocks.`;/, 'const prompt = `' + newPrompt.replace(/\${rawText}/, '${rawText}') + '`;');

fs.writeFileSync(path, code);
