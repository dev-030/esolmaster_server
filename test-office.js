const { parseOffice } = require('officeparser');

async function test() {
  const buf = Buffer.from("Hello world", 'utf-8');
  try {
    const ast = await parseOffice(buf, { fileType: 'md' });
    console.log(ast.toText());
  } catch (e) {
    console.error(e);
  }
}
test();
