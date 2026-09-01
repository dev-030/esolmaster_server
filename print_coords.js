const fs = require('fs');
const data = JSON.parse(fs.readFileSync('accuracy_report.json', 'utf8'));
const doc = data.find(d => d.paper === 'ESOL_Entry1_Reading_PracticePaper_SetA_TUTOR.pdf');
console.log(JSON.stringify(doc.metadata?.sections, null, 2));
