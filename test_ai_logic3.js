const fs = require('fs');
const { parseOffice } = require('officeparser');
const axios = require('axios');
require('dotenv').config({ path: '.env' });

async function test() {
  try {
    const buffer = fs.readFileSync('../ESOL_Entry1_Reading_PracticePaper_SetA_TUTOR.pdf');
    const ast = await parseOffice(buffer, { fileType: 'pdf' });
    const rawText = ast.toText();

    const code = fs.readFileSync('./src/task/task.service.ts', 'utf8');
    const promptRegex = /const prompt = `([\s\S]*?)`;/;
    let promptTemplate = code.match(promptRegex)[1];
    let prompt = promptTemplate.replace('${rawText}', rawText);

    const geminiHeaders = {
      'x-goog-api-key': process.env.GEMINI_API_KEY,
      'Content-Type': 'application/json',
    };

    console.log('Sending to AI...');
    const res = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
      { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
      { headers: geminiHeaders, timeout: 90000 }
    );
    console.log('SUCCESS AI. Response:');
    console.log(res.data.candidates[0].content.parts[0].text);
  } catch (err) {
    console.error('Error:', err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
  }
}

test();
