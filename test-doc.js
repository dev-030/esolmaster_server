const WordExtractor = require('word-extractor');

async function test() {
  const extractor = new WordExtractor();
  // Provide the path to "Present Simple.doc" or read it into a buffer
  try {
    const fs = require('fs');
    const buf = fs.readFileSync('/Users/jamil/Desktop/esolmaster/Present Simple.doc');
    const extracted = await extractor.extract(buf);
    console.log("Success! Length:", extracted.getBody().length);
    console.log(extracted.getBody().substring(0, 100));
  } catch (e) {
    console.error(e);
  }
}
test();
