import { Injectable } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';

@Injectable()
export class OpenAIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async extractPdf(prompt: string, file: Express.Multer.File): Promise<string> {
    const startTime = performance.now();
    console.log('Trying OpenAI GPT-5.6 Luna via Responses API...');
    
    const fileObj = await toFile(file.buffer, file.originalname, { type: file.mimetype });

    console.log('Uploading file to OpenAI...');
    const uploadStart = performance.now();
    const uploadedFile = await this.openai.files.create({
      file: fileObj,
      purpose: "user_data" as any
    });
    const uploadTime = ((performance.now() - uploadStart) / 1000).toFixed(2);
    console.log(`File uploaded successfully (ID: ${uploadedFile.id}) in ${uploadTime}s. Calling GPT-5.6-Luna...`);
    
    const requestStart = performance.now();
    
    // We define the schema to use Structured Outputs. This guarantees format and reduces output tokens.
    const esolSchema = {
      type: "object",
      properties: {
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "UUID v4" },
              title: { type: "string", description: "Task name e.g. Task 1" },
              instruction: { type: "string" },
              content: { type: "string", description: "Leave empty" }
            },
            required: ["id", "title", "instruction", "content"],
            additionalProperties: false
          }
        },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "UUID v4" },
              sectionId: { type: "string" },
              type: { type: "string", enum: ["TRUE_FALSE", "MCQ", "GAP_FILL", "QUESTION_ANSWER"] },
              content: { type: "string" },
              marks: { type: "number" },
              config: {
                type: "object",
                properties: {
                  options: { type: "array", items: { type: "string" } },
                  correctIndex: { type: "number" }
                },
                required: ["options", "correctIndex"],
                additionalProperties: false
              }
            },
            required: ["id", "sectionId", "type", "content", "marks"],
            additionalProperties: false
          }
        }
      },
      required: ["sections", "questions"],
      additionalProperties: false
    };

    const response = await this.openai.responses.create({
      model: "gpt-5.6-luna",
      input: [{
        role: "user",
        content: [
          {
            type: "input_file",
            file_id: uploadedFile.id
          },
          {
            type: "input_text",
            text: prompt
          }
        ]
      }],
      text: { 
        format: { 
          type: 'json_schema',
          json_schema: {
            name: "esol_paper_schema",
            strict: true,
            schema: esolSchema
          }
        } 
      },
      reasoning: { effort: 'low' } // <-- KEY LATENCY OPTIMIZATION
    } as any);

    const requestTime = ((performance.now() - requestStart) / 1000).toFixed(2);
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`SUCCESS: OpenAI GPT-5.6 Luna. Model inference took ${requestTime}s (Total API time: ${totalTime}s)`);
    
    const responseText = (response as any).output_text || (response as any).choices?.[0]?.message?.content || "";
    
    if (!responseText) {
      console.error('Empty response from OpenAI. Full object:', JSON.stringify(response, null, 2));
    }
    
    // We are deliberately keeping the file for file reuse (optional cleanup later)
    // Actually, I will leave the cleanup but explain we could reuse it if we needed.
    // The user asked: "Explain whether I should keep the uploaded file_id instead of immediately deleting it."
    try {
      await this.openai.files.delete(uploadedFile.id);
      console.log(`Cleaned up file ${uploadedFile.id} from OpenAI`);
    } catch (e) {
      console.warn('Failed to delete file from OpenAI', e);
    }
    
    return responseText;
  }
}
