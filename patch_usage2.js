const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const oldStr = `      if (chunk.usage) {
        console.log(\`\\nInput tokens: \${chunk.usage.prompt_tokens}\`);
        console.log(\`Output tokens: \${chunk.usage.completion_tokens}\`);
        console.log(\`Total tokens: \${chunk.usage.total_tokens}\`);
        console.log(\`Cached input tokens: \${chunk.usage.prompt_tokens_details?.cached_tokens ?? 'N/A'}\`);
        console.log(\`Reasoning tokens: \${chunk.usage.completion_tokens_details?.reasoning_tokens ?? 'N/A'}\`);
      }`;

const newStr = `      if (chunk.usage) {
        console.log(\`\\nInput tokens: \${chunk.usage.input_tokens}\`);
        console.log(\`Output tokens: \${chunk.usage.output_tokens}\`);
        console.log(\`Total tokens: \${chunk.usage.total_tokens}\`);
        console.log(\`Cached input tokens: \${chunk.usage.input_tokens_details?.cached_tokens ?? 'N/A'}\`);
        console.log(\`Reasoning tokens: \${chunk.usage.output_tokens_details?.reasoning_tokens ?? 'N/A'}\`);
      }`;

code = code.replace(oldStr, newStr);

fs.writeFileSync(file, code);
console.log("Usage keys fixed");
