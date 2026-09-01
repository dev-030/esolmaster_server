const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `    // Backend validation of AI response
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
    }`;

const newStr = `    // Backend Validation with Severity
    const validSectionsCount = parsed.sections ? parsed.sections.length : 0;
    const globalErrors = [];
    const globalWarnings = [];
    
    if (parsed.questions) {
      for (const q of parsed.questions) {
        q.validation = { errors: [], warnings: [], reviewRequired: [] };
        
        // Check structural Section relationship
        if (typeof q.sectionIndex !== 'number' || q.sectionIndex < 0 || q.sectionIndex >= validSectionsCount) {
          const msg = \`Invalid sectionIndex \${q.sectionIndex}\`;
          q.validation.errors.push(msg);
          globalErrors.push(msg);
          // Do NOT default to 0. It will result in sectionId = undefined below, which is safe for debugging.
        }
        
        // Validate MCQ
        if (q.type === 'MCQ') {
          if (!q.config || !q.config.options || q.config.options.length < 2) {
             const msg = "Invalid MCQ: Must have at least 2 options.";
             q.validation.errors.push(msg);
             globalErrors.push(msg);
          }
          if (q.config && typeof q.config.correctIndex === 'number') {
             if (q.config.correctIndex < 0 || q.config.correctIndex >= (q.config.options?.length || 0)) {
                 const msg = \`MCQ correctIndex out of bounds: \${q.config.correctIndex}\`;
                 q.validation.errors.push(msg);
                 globalErrors.push(msg);
                 // Do not mutate, leave the bad index for debugging.
             }
          }
        }
        
        // Answer States requiring review
        if (q.answerState === 'UNKNOWN') {
           q.validation.reviewRequired.push("Answer is UNKNOWN. Teacher must solve.");
        }
        if (q.confidence === 'LOW') {
           q.validation.reviewRequired.push("Low confidence answer. Teacher review advised.");
        }
      }
    }
    
    parsed.validationReport = { errors: globalErrors, warnings: globalWarnings };
    `;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("Validation v2 patched!");
