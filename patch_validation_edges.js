const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const oldValid = `            if (r.x < 0 || r.y < 0 || r.width <= 0.01 || r.height <= 0.01 || r.x + r.width > 1.1 || r.y + r.height > 1.1) {
              section.validation.errors.push("Crop coordinates out of bounds or trivially small.");
              globalErrors.push("Crop coordinates out of bounds.");
              continue;
            }
            if (r.confidence === 'LOW' || r.confidence === 'MEDIUM') {
              section.validation.reviewRequired.push(\`Context crop confidence is \${r.confidence}. Please review boundaries.\`);
            }

            const cropUrl = this.uploadService.generateCropUrl(tempPdf.public_id, r.page, r.x, r.y, r.width, r.height);`;

const newValid = `            const left = typeof r.left === 'number' ? r.left : (r.x || 0);
            const top = typeof r.top === 'number' ? r.top : (r.y || 0);
            let right = typeof r.right === 'number' ? r.right : undefined;
            let bottom = typeof r.bottom === 'number' ? r.bottom : undefined;
            
            if (right === undefined) { right = left + (r.width || 0); }
            if (bottom === undefined) { bottom = top + (r.height || 0); }

            const width = right - left;
            const height = bottom - top;

            if (left < 0 || top < 0 || right > 1 || bottom > 1 || left >= right || top >= bottom) {
              section.validation.errors.push("Crop coordinates out of bounds or invalid.");
              globalErrors.push("Crop coordinates out of bounds.");
              continue;
            }
            if (r.confidence === 'LOW' || r.confidence === 'MEDIUM') {
              section.validation.reviewRequired.push(\`Context crop confidence is \${r.confidence}. Please review boundaries.\`);
            }

            const cropUrl = this.uploadService.generateCropUrl(tempPdf.public_id, r.page, left, top, width, height);`;

code = code.replace(oldValid, newValid);
fs.writeFileSync(file, code);
