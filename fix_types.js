const fs = require('fs');

// task.service.ts
let file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(`const globalErrors = [];\n    const globalWarnings = [];`, `const globalErrors: string[] = [];\n    const globalWarnings: string[] = [];`);
fs.writeFileSync(file, code);

// test_accuracy.ts
file = 'test_accuracy.ts';
code = fs.readFileSync(file, 'utf8');
code = code.replace(`const report = [];`, `const report: any[] = [];`);
fs.writeFileSync(file, code);

// print_json.ts
file = 'print_json.ts';
if (fs.existsSync(file)) {
  code = fs.readFileSync(file, 'utf8');
  code = code.replace(`fs.writeFileSync('output.json', jsonStr);`, `fs.writeFileSync('output.json', jsonStr.responseText);`);
  fs.writeFileSync(file, code);
}

// run_benchmark.ts
file = 'run_benchmark.ts';
if (fs.existsSync(file)) {
  code = fs.readFileSync(file, 'utf8');
  code = code.replace(`JSON.parse(jsonStr)`, `JSON.parse(jsonStr.responseText)`);
  fs.writeFileSync(file, code);
}

console.log("Types fixed!");
