import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData from 'form-data';

const TARGET_URL = 'http://localhost:5301/tasks/import-pdf'; 

async function testAccuracy() {
  console.log('--- STARTING ACCURACY TEST ---');
  
  const dirs = [path.join(__dirname, '../'), path.join(__dirname, '../khalaf79-attachments/')];
  const files: string[] = [];

  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      const dirFiles = fs.readdirSync(dir)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .map(f => path.join(dir, f));
      files.push(...dirFiles);
    }
  }
  
  if (files.length === 0) {
    console.log('No PDFs found for testing');
    return;
  }

  const report: any[] = [];

  for (const filePath of files) {
    const filename = path.basename(filePath);
    console.log(`\nTesting ${filename}...`);
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    const startTime = Date.now();
    try {
      const response = await axios.post(TARGET_URL, formData, {
        headers: formData.getHeaders(),
        timeout: 300000 
      });
      const data = response.data;
      const duration = (Date.now() - startTime) / 1000;

      let printedAnswers = 0;
      let aiSolvedAnswers = 0;
      let unknownAnswers = 0;
      let totalContextRegions = 0;

      data.sections?.forEach((s: any) => {
         if (s.imageUrl) totalContextRegions++;
      });

      data.questions?.forEach((q: any) => {
        if (q.answerState === 'PRINTED') printedAnswers++;
        if (q.answerState === 'AI_SOLVED') aiSolvedAnswers++;
        if (q.answerState === 'UNKNOWN') unknownAnswers++;
      });

      const result = {
        paper: filename,
        documentType: data.documentType || 'UNKNOWN',
        taskCount: data.sections?.length || 0,
        questionCount: data.questions?.length || 0,
        contextRegionCount: totalContextRegions,
        answerStates: {
          printed: printedAnswers,
          aiSolved: aiSolvedAnswers,
          unknown: unknownAnswers
        },
        validationReport: data.validationReport || { errors: [], warnings: [] },
        metadata: data.metadata || {},
        processingTime: duration,
        status: 'SUCCESS'
      };
      
      console.log(JSON.stringify(result, null, 2));
      report.push(result);
    } catch (err: any) {
      console.error(`Failed ${filename}: ${err.message}`);
      report.push({
        paper: filename,
        status: 'FAILED',
        error: err.message
      });
    }
  }

  fs.writeFileSync('accuracy_report.json', JSON.stringify(report, null, 2));
  console.log('\n--- TEST COMPLETE ---');
  console.log('Report saved to accuracy_report.json');
}

testAccuracy();
