const fs = require('fs');
const { parseOffice } = require('officeparser');
const axios = require('axios');
require('dotenv').config({ path: '.env' });

async function test() {
  try {
    const buffer = fs.readFileSync('../ESOL_Entry1_Reading_PracticePaper_SetA_TUTOR.pdf');
    const ast = await parseOffice(buffer, { fileType: 'pdf' });
    const rawText = ast.toText();

    const prompt = `
You are an expert ESOL teacher extracting an exam paper into JSON.
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
- Strip leading question numbers (e.g. remove "7 " from the start of the question).
- Preserve all special symbols (£, $, math signs) exactly as they appear.
- Determine the question type from the source text:
  - If the text provides multiple choices (like a, b, c), set "type": "MCQ". Do NOT include the option letters (a, b, c) in the extracted options array.
  - If it is an open question where the student must write their own answer (no options provided), set "type": "QUESTION_ANSWER" and omit the "config" property.

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

For open-ended questions, use this format:
{
  "id": "generate-a-unique-uuid-here",
  "sectionId": "the-uuid-of-the-section-this-belongs-to",
  "type": "QUESTION_ANSWER",
  "content": "<p>The open question text</p>",
  "marks": 1
}

Exam Text:
${rawText}

Format as strict JSON without any markdown code blocks.`;

    const geminiHeaders = {
      'x-goog-api-key': process.env.GEMINI_API_KEY,
      'Content-Type': 'application/json',
    };

    console.log('Sending to AI...');
    const res = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
      { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
      { headers: geminiHeaders, timeout: 90000 }
    );
    console.log('SUCCESS AI. Response:');
    console.log(res.data.candidates[0].content.parts[0].text.substring(0, 500));
  } catch (err) {
    console.error('Error:', err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
  }
}

test();
