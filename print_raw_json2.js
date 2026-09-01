require('dotenv').config();
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/src/app.module');
const { TaskService } = require('./dist/src/task/task.service');
const fs = require('fs');
const path = require('path');

async function testRun() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const taskService = app.get(TaskService);
  const filePath = path.join(__dirname, '../ESOL_Entry1_Reading_PracticePaper_SetA_TUTOR.pdf');
  const buffer = fs.readFileSync(filePath);
  const mockFile = { buffer, originalname: 'test.pdf', mimetype: 'application/pdf', size: buffer.length };
  
  const data = await taskService.importPdf(mockFile);
  
  data.sections.forEach(s => {
    console.log("Section", s.sectionIndex);
    if (s.contextRegions) {
      s.contextRegions.forEach(r => {
        console.log("  x:", r.x, "y:", r.y, "w:", r.width, "h:", r.height);
      });
    }
  });
  
  await app.close();
}
testRun();
