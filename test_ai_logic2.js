const fs = require('fs');
const { parseOffice } = require('officeparser');
const axios = require('axios');
require('dotenv').config();

async function test() {
  try {
    const buffer = fs.readFileSync('../ESOL_Entry1_Reading_PracticePaper_SetA_TUTOR.pdf');
    const ast = await parseOffice(buffer, { fileType: 'pdf' });
    const rawText = ast.toText();

    console.log('Sending to AI...');
    const res = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
      { contents: [{ role: 'user', parts: [{ text: 'Please reply with \"working\"' }] }], generationConfig: { response_mime_type: 'application/json' } },
      { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' }, timeout: 90000 }
    );
    console.log('SUCCESS AI. Response:', res.data.candidates[0].content.parts[0].text);
  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  }
}

test();
