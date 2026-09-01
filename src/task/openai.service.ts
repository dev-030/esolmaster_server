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

  async extractPdf(prompt: string, file: Express.Multer.File): Promise<{ responseText: string; metadata: any }> {
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
        documentType: { type: "string", enum: ["CANDIDATE_PAPER", "TUTOR_COPY", "ASSESSOR_PACK", "SAMPLE_PAPER", "PRACTICE_PAPER", "UNKNOWN"] },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sectionIndex: { type: "number" },
              title: { type: "string", description: "e.g. Task 1" },
              instruction: { type: "string" },
              contextRegions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    page: { type: "number", description: "1-indexed page number" },
                    left: { type: "number", description: "Normalized 0-1 left edge" },
                    top: { type: "number", description: "Normalized 0-1 top edge" },
                    right: { type: "number", description: "Normalized 0-1 right edge" },
                    bottom: { type: "number", description: "Normalized 0-1 bottom edge" },
                    purpose: { type: "string", description: "e.g. Poster for Task 1" },
                    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }
                  },
                  required: ["page", "left", "top", "right", "bottom", "purpose", "confidence"],
                  additionalProperties: false
                }
              }
            },
            required: ["sectionIndex", "title", "instruction", "contextRegions"],
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
                  sectionIndex: { type: "number" },
                  type: { type: "string", enum: ["MCQ", "TRUE_FALSE", "GAP_FILL"] },
                  content: { type: "string" },
                  marks: { type: "number" },
                  answerState: { type: "string", enum: ["PRINTED", "AI_SOLVED", "TEACHER_PROVIDED", "VERIFIED", "CONFLICT", "UNKNOWN"] },
                  confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                  evidence: { type: "string" },
                  config: {
                    type: "object",
                    properties: {
                      options: { type: "array", items: { type: "string" } },
                      correctIndex: { type: ["number", "null"] },
                      answer: { type: ["string", "null"] }
                    },
                    required: ["options", "correctIndex", "answer"],
                    additionalProperties: false
                  }
                },
                required: ["sectionIndex", "type", "content", "marks", "answerState", "confidence", "evidence", "config"],
                additionalProperties: false
              },
              {
                type: "object",
                properties: {
                  sectionIndex: { type: "number" },
                  type: { type: "string", enum: ["QUESTION_ANSWER", "INSTRUCTION"] },
                  content: { type: "string" },
                  marks: { type: "number" },
                  answerState: { type: "string", enum: ["PRINTED", "AI_SOLVED", "TEACHER_PROVIDED", "VERIFIED", "CONFLICT", "UNKNOWN"] },
                  confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                  evidence: { type: "string" },
                  config: {
                    type: "object",
                    properties: {
                      answer: { type: ["string", "null"] }
                    },
                    required: ["answer"],
                    additionalProperties: false
                  }
                },
                required: ["sectionIndex", "type", "content", "marks", "answerState", "confidence", "evidence", "config"],
                additionalProperties: false
              }
            ]
          }
        }
      },
      required: ["documentType", "sections", "questions"],
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
          name: "esol_paper_schema",
          strict: true,
          schema: esolSchema
        } 
      },
      reasoning: { effort: 'none' },
      stream: true // <-- STREAMING FOR BENCHMARKING
    } as any);

    let firstTokenTime: number | null = null;
    let responseText = "";
    let metadata: any = {};

    // Iterate through the stream to calculate TTFT (Time to First Token)
    for await (const chunk of responseStream as any) {
      if (!firstTokenTime) {
        firstTokenTime = performance.now();
        const ttft = ((firstTokenTime - requestStart) / 1000).toFixed(2);
        console.log(`[Benchmark] Time to First Token / Stream Event: ${ttft}s`);
      }
      
      // In Responses API streaming, the text is emitted in chunks
      // Fallback for standard chat completions chunking if the schema differs slightly
      
      if (chunk.usage) {
        console.log(`
Input tokens: ${chunk.usage.prompt_tokens}`);
        console.log(`Output tokens: ${chunk.usage.completion_tokens}`);
        console.log(`Total tokens: ${chunk.usage.total_tokens}`);
        console.log(`Cached input tokens: ${chunk.usage.prompt_tokens_details?.cached_tokens ?? 'N/A'}`);
        console.log(`Reasoning tokens: ${chunk.usage.completion_tokens_details?.reasoning_tokens ?? 'N/A'}`);
      }
      
      
      let metadata = {};
      if (chunk.type === 'response.completed') {
        const u = chunk.response?.usage;
        metadata = {
          uploadTime,
          timeToFirstToken: ((firstTokenTime! - requestStart) / 1000).toFixed(2),
          generationTime: ((performance.now() - firstTokenTime!) / 1000).toFixed(2),
          totalInference: ((performance.now() - requestStart) / 1000).toFixed(2),
          totalApi: ((performance.now() - startTime) / 1000).toFixed(2),
          inputTokens: u?.input_tokens ?? 0,
          outputTokens: u?.output_tokens ?? 0,
          totalTokens: u?.total_tokens ?? 0
        };
        metadata = {
          uploadTime,
          timeToFirstToken: ((firstTokenTime! - requestStart) / 1000).toFixed(2),
          generationTime: ((performance.now() - firstTokenTime!) / 1000).toFixed(2),
          totalInference: ((performance.now() - requestStart) / 1000).toFixed(2),
          totalApi: ((performance.now() - startTime) / 1000).toFixed(2),
          inputTokens: u?.input_tokens ?? 0,
          outputTokens: u?.output_tokens ?? 0,
          totalTokens: u?.total_tokens ?? 0
        };
        console.log(`\n========== OPENAI BENCHMARK ==========\n`);
        console.log(`PDF upload time:                    ${uploadTime}s`);
        console.log(`Time to first stream event:         ${((firstTokenTime! - requestStart) / 1000).toFixed(2)}s`);
        console.log(`Generation time:                    ${((performance.now() - firstTokenTime!) / 1000).toFixed(2)}s`);
        console.log(`Total model inference:              ${((performance.now() - requestStart) / 1000).toFixed(2)}s`);
        console.log(`Total API processing:               ${((performance.now() - startTime) / 1000).toFixed(2)}s`);
        console.log(`Total backend request:              ${((performance.now() - startTime) / 1000).toFixed(2)}s`);
        console.log(`\n--------------- TOKEN USAGE ----------------\n`);
        console.log(`Input tokens:                       ${u?.input_tokens ?? 'N/A'}`);
        console.log(`Output tokens:                      ${u?.output_tokens ?? 'N/A'}`);
        console.log(`Total tokens:                       ${u?.total_tokens ?? 'N/A'}`);
        console.log(`Cached input tokens:                ${u?.input_tokens_details?.cached_tokens ?? 'N/A'}`);
        console.log(`Reasoning tokens:                   ${u?.output_tokens_details?.reasoning_tokens ?? 'N/A'}`);
        console.log(`\n=============================================\n`);
        console.log("[OpenAI] Usage:", u);
      }
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
    
    return { responseText, metadata: {} };
  }
}
