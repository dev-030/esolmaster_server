const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `      if (chunk.type === 'response.completed') {
        console.log(\`\\nInput tokens: \${chunk.response?.usage?.input_tokens ?? 'N/A'}\`);
        console.log(\`Output tokens: \${chunk.response?.usage?.output_tokens ?? 'N/A'}\`);
        console.log(\`Total tokens: \${chunk.response?.usage?.total_tokens ?? 'N/A'}\`);
        console.log(\`Cached input tokens: \${chunk.response?.usage?.input_tokens_details?.cached_tokens ?? 'N/A'}\`);
        console.log(\`Reasoning tokens: \${chunk.response?.usage?.output_tokens_details?.reasoning_tokens ?? 'N/A'}\`);
      }`;

const replaceStr = `      if (chunk.type === 'response.completed') {
        const u = chunk.response?.usage;
        console.log(\`\\n========== OPENAI BENCHMARK ==========\\n\`);
        console.log(\`PDF upload:                 \${uploadTime}s\`);
        console.log(\`Time to first stream event: \${((firstTokenTime! - requestStart) / 1000).toFixed(2)}s\`);
        console.log(\`Generation time:            \${((performance.now() - firstTokenTime!) / 1000).toFixed(2)}s\`);
        console.log(\`Total model inference:      \${((performance.now() - requestStart) / 1000).toFixed(2)}s\`);
        console.log(\`Total API processing:       \${((performance.now() - startTime) / 1000).toFixed(2)}s\`);
        console.log(\`\\nInput tokens:               \${u?.input_tokens ?? 'N/A'}\`);
        console.log(\`Output tokens:              \${u?.output_tokens ?? 'N/A'}\`);
        console.log(\`Total tokens:               \${u?.total_tokens ?? 'N/A'}\`);
        console.log(\`Cached input tokens:        \${u?.input_tokens_details?.cached_tokens ?? 'N/A'}\`);
        console.log(\`Reasoning tokens:           \${u?.output_tokens_details?.reasoning_tokens ?? 'N/A'}\`);
        console.log(\`\\n=======================================\\n\`);
      }`;

code = code.replace(targetStr, replaceStr);

fs.writeFileSync(file, code);
