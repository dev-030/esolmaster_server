const fs = require('fs');
const { parseOffice } = require('officeparser');

const files = [
  '../khalaf79-attachments/7908 -Sample paper 1 -E1 Reading.pdf',
  '../khalaf79-attachments/ESB-Set-F-Reading-Entry-1-v1.0-1.pdf',
  '../khalaf79-attachments/E1 ESOL Reading Candidate Paper PPA.pdf',
  '../ESOL_Entry1_Reading_PracticePaper_SetA_TUTOR.pdf'
];

async function dump() {
  for (const file of files) {
    try {
      console.log(`\n\n--- DUMPING: ${file} ---\n`);
      const buffer = fs.readFileSync(file);
      const ast = await parseOffice(buffer, { fileType: 'pdf' });
      const text = ast.toText();
      console.log(text.substring(0, 2000)); // Print first 2000 chars to see structure
    } catch (err) {
      console.error(`Error with ${file}:`, err.message);
    }
  }
}

dump();
