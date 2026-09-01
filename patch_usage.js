const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = 'const textChunk = chunk.output_text || chunk.text || chunk.choices?.[0]?.delta?.content || "";';
const replaceStr = `
      if (chunk.usage) {
        console.log(\`\nInput tokens: \${chunk.usage.prompt_tokens}\`);
        console.log(\`Output tokens: \${chunk.usage.completion_tokens}\`);
        console.log(\`Total tokens: \${chunk.usage.total_tokens}\`);
        console.log(\`Cached input tokens: \${chunk.usage.prompt_tokens_details?.cached_tokens ?? 'N/A'}\`);
        console.log(\`Reasoning tokens: \${chunk.usage.completion_tokens_details?.reasoning_tokens ?? 'N/A'}\`);
      }
      
      const textChunk = chunk.output_text || chunk.text || chunk.choices?.[0]?.delta?.content || "";`;

code = code.replace(targetStr, replaceStr);

fs.writeFileSync(file, code);
console.log("Patched usage");
