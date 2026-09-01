const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetOpenAIStr = `      try {
        responseText = await this.openaiService.extractPdf(prompt, file);
      } catch (err: any) {`;

const newOpenAIStr = `      let metadata: any = {};
      try {
        const aiResult = await this.openaiService.extractPdf(prompt, file);
        responseText = aiResult.responseText;
        metadata = aiResult.metadata;
      } catch (err: any) {`;

code = code.replace(targetOpenAIStr, newOpenAIStr);

const targetReturn = `    return {
      sections: sectionsWithIds,
      questions: questionsWithIds
    };`;

const newReturn = `    return {
      documentType: parsed.documentType || 'UNKNOWN',
      sections: sectionsWithIds,
      questions: questionsWithIds,
      validationReport: parsed.validationReport,
      metadata: typeof metadata !== 'undefined' ? metadata : {}
    };`;

code = code.replace(targetReturn, newReturn);
fs.writeFileSync(file, code);
console.log("importPdf return patched!");
