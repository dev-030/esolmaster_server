const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `    // Process context regions via Cloudinary if available`;

const newStr = `    // Backend validation of AI response
    const validSectionsCount = parsed.sections ? parsed.sections.length : 0;
    
    if (parsed.questions) {
      for (const q of parsed.questions) {
        if (q.sectionIndex < 0 || q.sectionIndex >= validSectionsCount) {
          console.warn("Validation Warning: Invalid sectionIndex mapped to 0.");
          q.sectionIndex = 0;
        }
        if (q.type === 'MCQ' && (!q.config || !q.config.options || q.config.options.length < 2)) {
           console.warn("Validation Warning: Invalid MCQ options.");
        }
        if (q.type === 'MCQ' && q.config && typeof q.config.correctIndex === 'number') {
           if (q.config.correctIndex < 0 || q.config.correctIndex >= (q.config.options?.length || 0)) {
               console.warn("Validation Warning: correctIndex out of bounds.");
               q.config.correctIndex = 0;
           }
        }
      }
    }

    // Process context regions via Cloudinary if available`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("Validation patched!");
