const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(`    let responseText = '';

    if (process.env.AI_PROVIDER === 'openai') {`, `    let responseText = '';
    let metadata: any = {};

    if (process.env.AI_PROVIDER === 'openai') {`);

code = code.replace(`      let metadata: any = {};
      try {`, `      try {`);

fs.writeFileSync(file, code);
console.log("Fixed metadata scope!");
