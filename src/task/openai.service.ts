import axios from 'axios';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OpenAIService {
  async extractPdf(prompt: string, file: Express.Multer.File): Promise<string> {
    console.log('Trying OpenAI GPT-5.6 Luna...');
    
    const base64File = file.buffer.toString('base64');
    const dataUri = `data:${file.mimetype};base64,${base64File}`;

    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-5.6-luna',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'file_url', file_url: { url: dataUri } }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 90000,
      }
    );

    console.log('SUCCESS: OpenAI GPT-5.6 Luna');
    return res.data.choices[0].message.content;
  }
}
