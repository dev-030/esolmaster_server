const fs = require('fs');
let code = fs.readFileSync('run_benchmark.ts', 'utf8');

const targetStr = `      data.sections?.forEach((s: any) => {
         if (s.imageUrl) totalContextRegions++;
      });`;

const newStr = `      data.sections?.forEach((s: any) => {
         if (s.imageUrl) {
            totalContextRegions++;
            const base64Data = s.imageUrl.replace(/^data:image\\/\\w+;base64,/, "");
            const buf = Buffer.from(base64Data, 'base64');
            const safeName = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const outPath = require('path').join('/Users/jamil/.gemini/antigravity/brain/7c92cdd2-e5a1-4272-b8da-81403f973bbc/scratch/', \`\${safeName}_sec\${s.sectionIndex}.png\`);
            fs.writeFileSync(outPath, buf);
         }
      });`;

code = code.replace(targetStr, newStr);
fs.writeFileSync('run_benchmark.ts', code);
console.log("Benchmark patched for images!");
