const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace("stream: true, stream_options: { include_usage: true } // <-- STREAMING FOR BENCHMARKING", "stream: true // <-- STREAMING FOR BENCHMARKING");

fs.writeFileSync(file, code);
console.log("Patched stream_opts back to stream: true");
