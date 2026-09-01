import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData from 'form-data';

async function testSingle() {
  const filePath = path.join(__dirname, '../ESOL_Entry1_Reading_PracticePaper_SetA_TUTOR.pdf');
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath));

  try {
    const response = await axios.post('http://localhost:5301/tasks/import-pdf', formData, {
      headers: formData.getHeaders(),
      timeout: 300000 
    });
    console.log("Success:", JSON.stringify(response.data, null, 2).slice(0, 500));
  } catch (err: any) {
    console.error("Failed:", err.response?.data || err.message);
  }
}
testSingle();
