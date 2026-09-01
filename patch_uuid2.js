const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace("const { v4: uuidv4 } = require('uuid');", "const crypto = require('crypto');\n    const uuidv4 = () => crypto.randomUUID();");
fs.writeFileSync(file, code);
