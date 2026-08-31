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
    
    // Convert multer buffer to an OpenAI File object
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
      text: { format: { type: 'json_object' } }
    } as any);

    const requestTime = ((performance.now() - requestStart) / 1000).toFixed(2);
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`SUCCESS: OpenAI GPT-5.6 Luna. Model inference took ${requestTime}s (Total API time: ${totalTime}s)`);
    
    // The Responses API puts the text directly on the root object
    const responseText = (response as any).output_text || (response as any).choices?.[0]?.message?.content || "";
    
    if (!responseText) {
      console.error('Empty response from OpenAI. Full object:', JSON.stringify(response, null, 2));
    }
    
    // Clean up the file to save storage space
    try {
      await this.openai.files.delete(uploadedFile.id);
      console.log(`Cleaned up file ${uploadedFile.id} from OpenAI`);
    } catch (e) {
      console.warn('Failed to delete file from OpenAI', e);
    }
    
    return responseText;
  }
}
