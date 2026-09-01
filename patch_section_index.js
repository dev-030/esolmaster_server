const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetCheck = `if (typeof q.sectionIndex !== 'number' || q.sectionIndex < 0 || q.sectionIndex >= validSectionsCount) {`;
const newCheck = `const validSectionIndices = parsed.sections ? parsed.sections.map(s => s.sectionIndex) : [];
        if (typeof q.sectionIndex !== 'number' || !validSectionIndices.includes(q.sectionIndex)) {`;

code = code.replace(targetCheck, newCheck);

const targetMap = `    // Map questions
    const questionsWithIds = (parsed.questions || []).map(q => {
      const secId = sectionsWithIds[q.sectionIndex]?.id;`;
const newMap = `    // Map questions
    const questionsWithIds = (parsed.questions || []).map(q => {
      const parentSection = sectionsWithIds.find(s => s.sectionIndex === q.sectionIndex);
      const secId = parentSection ? parentSection.id : undefined;`;

code = code.replace(targetMap, newMap);

fs.writeFileSync(file, code);
console.log("SectionIndex mapping patched!");
