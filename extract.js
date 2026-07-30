const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function main() {
  const buffer = fs.readFileSync('d:\\Download\\Equivalent alimentaire (2).pdf');
  const parser = new PDFParse({ data: buffer });

  const text = await parser.getText();
  console.log('=== TEXT ===');
  console.log(text.text);

  const tables = await parser.getTable();
  console.log('\n=== TABLES ===');
  tables.pages.forEach((page, i) => {
    console.log(`\n--- Page ${i + 1} ---`);
    page.tables.forEach((table, j) => {
      console.log(`Table ${j + 1}:`);
      table.forEach(row => console.log(JSON.stringify(row)));
    });
  });

  await parser.destroy();
}

main().catch(console.error);
