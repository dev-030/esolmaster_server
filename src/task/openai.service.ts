import axios from 'axios';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OpenAIService {
  async extractPdf(prompt: string): Promise<string> {
    console.log('Trying OpenAI GPT-4o...');
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
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

    console.log('SUCCESS: OpenAI GPT-4o');
    return res.data.choices[0].message.content;
  }
}
