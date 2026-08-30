const fs = require('fs');
const pdfParse = require('pdf-parse');
const axios = require('axios');

async function test() {
  const filePath = '/Users/jamil/Desktop/esolmaster/khalaf79-attachments/ESB-Set-F-Reading-Entry-1-v1.0-1.pdf';
  console.log('Reading PDF...');
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(dataBuffer);
  console.log('Extracted Text Length:', pdfData.text.length);

  const prompt = `
You are an expert ESOL teacher. Your task is to extract the given reading passage/exam paper into a strict JSON structure.
We need two arrays in the root object: "sections" and "questions".

"sections" should be an array of objects matching:
{
  "id": "generate-a-unique-uuid-here",
  "title": "Main Passage Title",
  "instruction": "Reading instruction",
  "stimulusType": "RICH_TEXT",
  "content": "<p>The actual reading text formatted with basic HTML</p>"
}

"questions" should be an array of objects matching:
{
  "id": "generate-a-unique-uuid-here",
  "sectionId": "the-uuid-of-the-section-this-belongs-to",
  "type": "MCQ", // MUST be one of: MCQ, TRUE_FALSE, GAP_FILL
  "content": "<p>The question text</p>",
  "marks": 1,
  "config": {
    "options": ["Option 1", "Option 2"],
    "correctIndex": 0
  }
}

Format as strict JSON without markdown blocks.`;

  console.log('Calling AI API...');
  try {
    const response = await axios.post('https://agentrouter.org/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: pdfData.text }
      ],
      response_format: { type: 'json_object' }
    }, {
      headers: {
        'Authorization': `Bearer sk-iJEyzQ2NNfCNQMRsoqVxwNVq2a74AktjtnH6aVXo9uMSeweu`,
        'Content-Type': 'application/json'
      }
    });

    let responseText = response.data.choices[0].message.content;
    console.log('Raw AI Response length:', responseText.length);
    responseText = responseText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(responseText);
    console.log('Parsed successfully! Sections:', parsed.sections?.length, 'Questions:', parsed.questions?.length);
    console.log(JSON.stringify(parsed, null, 2).substring(0, 500) + '...');
  } catch (e) {
    console.error('API Error:', e.response ? e.response.data : e.message);
  }
}

test();
