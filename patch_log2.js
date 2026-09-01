const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `        console.log(\`\\n========== OPENAI BENCHMARK ==========\\n\`);
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
        console.log(\`\\n=======================================\\n\`);`;

const replaceStr = `        console.log(\`\\n========== OPENAI BENCHMARK ==========\\n\`);
        console.log(\`PDF upload time:                    \${uploadTime}s\`);
        console.log(\`Time to first stream event:         \${((firstTokenTime! - requestStart) / 1000).toFixed(2)}s\`);
        console.log(\`Generation time:                    \${((performance.now() - firstTokenTime!) / 1000).toFixed(2)}s\`);
        console.log(\`Total model inference:              \${((performance.now() - requestStart) / 1000).toFixed(2)}s\`);
        console.log(\`Total API processing:               \${((performance.now() - startTime) / 1000).toFixed(2)}s\`);
        console.log(\`Total backend request:              \${((performance.now() - startTime) / 1000).toFixed(2)}s\`);
        console.log(\`\\n--------------- TOKEN USAGE ----------------\\n\`);
        console.log(\`Input tokens:                       \${u?.input_tokens ?? 'N/A'}\`);
        console.log(\`Output tokens:                      \${u?.output_tokens ?? 'N/A'}\`);
        console.log(\`Total tokens:                       \${u?.total_tokens ?? 'N/A'}\`);
        console.log(\`Cached input tokens:                \${u?.input_tokens_details?.cached_tokens ?? 'N/A'}\`);
        console.log(\`Reasoning tokens:                   \${u?.output_tokens_details?.reasoning_tokens ?? 'N/A'}\`);
        console.log(\`\\n=============================================\\n\`);
        console.log("[OpenAI] Usage:", u);`;

code = code.replace(targetStr, replaceStr);
fs.writeFileSync(file, code);
