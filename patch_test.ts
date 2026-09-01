const contentStr = JSON.stringify({ sections: [{ imageUrl: 'data:image/png;base64,xxxx' }]});
let content = JSON.parse(contentStr);
for (const sec of content.sections || []) {
  if (sec.imageUrl?.startsWith('data:image/')) {
    sec.imageUrl = 'https://cloudinary.com/xyz.png';
  }
}
console.log(JSON.stringify(content));
