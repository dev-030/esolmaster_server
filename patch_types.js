const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = 'const textChunk = chunk.output_text || chunk.text || chunk.choices?.[0]?.delta?.content || "";';
const replaceStr = `
      if (chunk.type === 'response.completed') {
        console.log(\`\\nInput tokens: \${chunk.response?.usage?.input_tokens ?? 'N/A'}\`);
        console.log(\`Output tokens: \${chunk.response?.usage?.output_tokens ?? 'N/A'}\`);
        console.log(\`Total tokens: \${chunk.response?.usage?.total_tokens ?? 'N/A'}\`);
        console.log(\`Cached input tokens: \${chunk.response?.usage?.input_tokens_details?.cached_tokens ?? 'N/A'}\`);
        console.log(\`Reasoning tokens: \${chunk.response?.usage?.output_tokens_details?.reasoning_tokens ?? 'N/A'}\`);
      }
      const textChunk = chunk.output_text || chunk.text || chunk.choices?.[0]?.delta?.content || "";`;

code = code.replace(/if \(chunk\.usage \|\| chunk\.response\?\.usage\) \{[\s\S]*?\}/g, "");
code = code.replace(targetStr, replaceStr);

fs.writeFileSync(file, code);
