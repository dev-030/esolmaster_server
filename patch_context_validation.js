const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `            // Validate bounds
            if (r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x + r.width <= 1.05 && r.y + r.height <= 1.05) {
              const cropUrl = this.uploadService.generateCropUrl(tempPdf.public_id, r.page, r.x, r.y, r.width, r.height);
              try {
                const response = await axios.get(cropUrl, { responseType: 'arraybuffer' });
                const base64 = Buffer.from(response.data, 'binary').toString('base64');
                section.imageUrl = \`data:image/png;base64,\${base64}\`;
              } catch (cropErr) {
                console.error("Failed to fetch crop from Cloudinary:", cropErr.message);
              }
            }`;

const newStr = `            // Validate Context Crop logically
            section.validation = { errors: [], warnings: [], reviewRequired: [] };
            
            if (r.page < 1) {
              section.validation.errors.push("Invalid page number.");
              globalErrors.push("Invalid page number for context crop.");
              continue;
            }
            if (r.x < 0 || r.y < 0 || r.width <= 0.01 || r.height <= 0.01 || r.x + r.width > 1.1 || r.y + r.height > 1.1) {
              section.validation.errors.push("Crop coordinates out of bounds or trivially small.");
              globalErrors.push("Crop coordinates out of bounds.");
              continue;
            }

            const cropUrl = this.uploadService.generateCropUrl(tempPdf.public_id, r.page, r.x, r.y, r.width, r.height);
            try {
              const response = await axios.get(cropUrl, { responseType: 'arraybuffer' });
              
              if (response.data.byteLength < 100) {
                 section.validation.errors.push("Generated crop image is suspiciously empty (too small).");
                 globalErrors.push("Empty crop generated.");
              } else {
                 const base64 = Buffer.from(response.data, 'binary').toString('base64');
                 section.imageUrl = \`data:image/png;base64,\${base64}\`;
                 section.validation.warnings.push("Context automatically cropped. Review boundaries.");
              }
            } catch (cropErr) {
              console.error("Failed to fetch crop from Cloudinary:", cropErr.message);
              section.validation.errors.push(\`Crop generation failed: \${cropErr.message}\`);
              globalErrors.push("Cloudinary crop generation failed.");
            }`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("Context validation patched!");
