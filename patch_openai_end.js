const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `    let firstTokenTime: number | null = null;
    let responseText = "";

    // Iterate through the stream to calculate TTFT (Time to First Token)
    for await (const chunk of responseStream as any) {`;

const newStr = `    let firstTokenTime: number | null = null;
    let responseText = "";
    let metadata: any = {};

    // Iterate through the stream to calculate TTFT (Time to First Token)
    for await (const chunk of responseStream as any) {`;

code = code.replace(targetStr, newStr);

const targetLogStr = `      if (chunk.type === 'response.completed') {
        const u = chunk.response?.usage;`;

const newLogStr = `      if (chunk.type === 'response.completed') {
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

const targetEndStr = `    if (!responseText) {
      throw new Error("Received empty response from OpenAI.");
    }
    return { responseText, metadata: {} };
  }
}`;

const newEndStr = `    if (!responseText) {
      throw new Error("Received empty response from OpenAI.");
    }
    return { responseText, metadata };
  }
}`;

code = code.replace(targetEndStr, newEndStr);
fs.writeFileSync(file, code);
console.log("Patched end!");
