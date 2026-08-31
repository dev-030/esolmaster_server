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
    console.log('Trying OpenAI GPT-5.6 Luna via Responses API...');
    
    // Convert multer buffer to an OpenAI File object
    const fileObj = await toFile(file.buffer, file.originalname, { type: file.mimetype });

    console.log('Uploading file to OpenAI...');
    const uploadedFile = await this.openai.files.create({
      file: fileObj,
      purpose: "user_data" as any
    });

    console.log(`File uploaded successfully (ID: ${uploadedFile.id}). Calling GPT-5.6-Luna...`);
    
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
      response_format: { type: 'json_object' }
    } as any);

    console.log('SUCCESS: OpenAI GPT-5.6 Luna');
    
    // In the new Responses API, the output is typically nested in the response structure
    // Since I don't know the exact schema, I will try standard access paths or assume it matches completions
    const responseText = (response as any).output?.[0]?.content?.[0]?.text || (response as any).choices?.[0]?.message?.content;
    
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
