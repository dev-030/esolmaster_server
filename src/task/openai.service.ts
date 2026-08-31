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
            anyOf: [
              {
                type: "object",
                properties: {
                  id: { type: "string", description: "UUID v4" },
                  sectionId: { type: "string" },
                  type: { type: "string", enum: ["MCQ", "TRUE_FALSE", "GAP_FILL"] },
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
                required: ["id", "sectionId", "type", "content", "marks", "config"],
                additionalProperties: false
              },
              {
                type: "object",
                properties: {
                  id: { type: "string", description: "UUID v4" },
                  sectionId: { type: "string" },
                  type: { type: "string", enum: ["QUESTION_ANSWER"] },
                  content: { type: "string" },
                  marks: { type: "number" }
                },
                required: ["id", "sectionId", "type", "content", "marks"],
                additionalProperties: false
              }
            ]
          }
        }
      },
      required: ["sections", "questions"],
      additionalProperties: false
    };

        const responseStream = await this.openai.responses.create({
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
      reasoning: { effort: 'minimal' },
      stream: true // <-- STREAMING FOR BENCHMARKING
    } as any);

    let firstTokenTime: number | null = null;
    let responseText = "";

    // Iterate through the stream to calculate TTFT (Time to First Token)
    for await (const chunk of responseStream as any) {
      if (!firstTokenTime) {
        firstTokenTime = performance.now();
        const ttft = ((firstTokenTime - requestStart) / 1000).toFixed(2);
        console.log(`[Benchmark] Time to First Token / Stream Event: ${ttft}s`);
      }
      
      // In Responses API streaming, the text is emitted in chunks
      // Fallback for standard chat completions chunking if the schema differs slightly
      const textChunk = chunk.output_text || chunk.text || chunk.choices?.[0]?.delta?.content || "";
      responseText += textChunk;
    }

    const requestTime = ((performance.now() - requestStart) / 1000).toFixed(2);
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`[Benchmark] Complete response received. Generation took ${((performance.now() - firstTokenTime!) / 1000).toFixed(2)}s`);
    console.log(`SUCCESS: OpenAI GPT-5.6 Luna. Total Model inference took ${requestTime}s (Total API time: ${totalTime}s)`);
    
    if (!responseText) {
      console.error('Empty response from OpenAI.');
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
