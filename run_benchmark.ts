import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { TaskService } from './src/task/task.service';
import * as fs from 'fs';
import * as path from 'path';

async function runBenchmark() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const taskService = app.get(TaskService);
  
  const rootDir = process.cwd();
  const dirs = [path.join(rootDir, '../'), path.join(rootDir, '../khalaf79-attachments/')];
  const files: string[] = [];

  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      const dirFiles = fs.readdirSync(dir)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .map(f => path.join(dir, f));
      files.push(...dirFiles);
    }
  }

  const report: any[] = [];

  for (const filePath of files) {
    const filename = path.basename(filePath);
    console.log(`\nTesting ${filename}...`);
    
    const buffer = fs.readFileSync(filePath);
    const mockFile = {
      buffer,
      originalname: filename,
      mimetype: 'application/pdf',
      size: buffer.length
    } as any;

    const startTime = Date.now();
    try {
      const data = await taskService.importPdf(mockFile);
      const duration = (Date.now() - startTime) / 1000;

      let printedAnswers = 0;
      let aiSolvedAnswers = 0;
      let unknownAnswers = 0;
      let totalContextRegions = 0;

      data.sections?.forEach((s: any) => {
         if (s.imageUrl) {
            totalContextRegions++;
            const base64Data = s.imageUrl.replace(/^data:image\/\w+;base64,/, "");
            const buf = Buffer.from(base64Data, 'base64');
            const safeName = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const outPath = require('path').join('/Users/jamil/.gemini/antigravity/brain/7c92cdd2-e5a1-4272-b8da-81403f973bbc/scratch/', `${safeName}_sec${s.sectionIndex}.png`);
            fs.writeFileSync(outPath, buf);
         }
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
  await app.close();
}

runBenchmark();
