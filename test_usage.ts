import { OpenAIService } from './src/task/openai.service';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const service = new OpenAIService();
  const pdfBuffer = fs.readFileSync('../ESOL_Entry1_Reading_PracticePaper_SetA_TUTOR.pdf');
  const file = {
    buffer: pdfBuffer,
    originalname: 'test.pdf',
    mimetype: 'application/pdf',
    size: pdfBuffer.length
  } as any;
  const prompt = `Extract all sections (Tasks) and questions from this ESOL examination paper.

## Rules:
1. Extract Sections: Title ("Task 1"), instruction, leave content empty.
2. Extract Questions: Convert all "INSTRUCTION" type questions (e.g., "Underline the postcode") into "QUESTION_ANSWER" (e.g., "What is the postcode? Write it below.").
3. Ignore candidate details, cover page info, headers, footers, marking grids, and invigilator instructions.
4. If it's a Tutor Copy with printed answers, set the correctIndex.`;
  await service.extractPdf(prompt, file);
}
run();
