const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/async extractPdf\(prompt: string, file: Express\.Multer\.File\): Promise<string> \{/, `async extractPdf(prompt: string, file: Express.Multer.File): Promise<{ responseText: string; metadata: any }> {`);

code = code.replace(/    return responseText;\n  \}\n\}/, `    return { responseText, metadata: {} };\n  }\n}`);

const targetLogStr = `      if (chunk.type === 'response.completed') {
        const u = chunk.response?.usage;`;

const newLogStr = `      let metadata = {};
      if (chunk.type === 'response.completed') {
        const u = chunk.response?.usage;
        metadata = {
          uploadTime,
          timeToFirstToken: ((firstTokenTime! - requestStart) / 1000).toFixed(2),
          generationTime: ((performance.now() - firstTokenTime!) / 1000).toFixed(2),
          totalInference: ((performance.now() - requestStart) / 1000).toFixed(2),
          totalApi: ((performance.now() - startTime) / 1000).toFixed(2),
          inputTokens: u?.input_tokens ?? 0,
          outputTokens: u?.output_tokens ?? 0,
          totalTokens: u?.total_tokens ?? 0
        };`;
code = code.replace(targetLogStr, newLogStr);

code = code.replace(/    if \(\!responseText\) \{/, `    if (!responseText) {`);
code = code.replace(/    return responseText;/, `    return { responseText, metadata: metadata || {} };`); // wait metadata is blocked scope

// Let's do it safer.
fs.writeFileSync(file, code);
console.log("Patched!");
