import { TaskService } from './src/task/task.service';
import { OpenAIService } from './src/task/openai.service';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const openaiService = new OpenAIService();
  const taskService = new TaskService({} as any, {} as any, openaiService);
  
  const pdfBuffer = fs.readFileSync('../ESOL_Entry1_Reading_PracticePaper_SetA_TUTOR.pdf');
  const file = {
    buffer: pdfBuffer,
    originalname: 'test.pdf',
    mimetype: 'application/pdf',
    size: pdfBuffer.length
  } as any;
  
  const res = await taskService.importPdf(file);
  console.log("Successfully mapped sections with UUIDs:", !!res.sections[0]?.id);
  console.log("Successfully mapped questions with sectionId:", !!res.questions[0]?.sectionId);
  fs.writeFileSync('mapped_output.json', JSON.stringify(res, null, 2));
}
run();
