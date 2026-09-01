import { OpenAIService } from './src/task/openai.service';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

// Patch the service to just dump the payload instead of sending it
const originalCreate = OpenAIService.prototype['openai'] ? null : 'Not initialized yet';

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

  // Mock openai
  (service as any).openai = {
    files: {
      create: async (opts) => {
        return { id: 'mock_file_123' };
      },
      delete: async () => {}
    },
    responses: {
      create: async (payload) => {
        console.log("=== REQUEST PAYLOAD ===");
        console.log(`model: ${payload.model}`);
        console.log(`input length: ${payload.input.length}`);
        console.log(`input[0].role: ${payload.input[0].role}`);
        console.log(`input[0].content[0].type: ${payload.input[0].content[0].type}`);
        console.log(`input[0].content[0].file_id: ${payload.input[0].content[0].file_id}`);
        console.log(`input[0].content[1].type: ${payload.input[0].content[1].type}`);
        console.log(`prompt character count: ${payload.input[0].content[1].text.length}`);
        console.log(`reasoning effort: ${payload.reasoning.effort}`);
        console.log(`stream: ${payload.stream}`);
        console.log("=======================");
        
        // Mock stream response
        return (async function* () {
          yield { type: 'response.completed' };
        })();
      }
    }
  };

  await service.extractPdf(prompt, file);
}
run();
