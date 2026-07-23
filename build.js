const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, 'dist');
const apiBase = process.env.API_BASE_URL || '';

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.cpSync(publicDir, distDir, { recursive: true });

const htmlFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.html'));
for (const file of htmlFiles) {
  const filePath = path.join(distDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  content = content.replace(
    "window.API_BASE = ''",
    `window.API_BASE = '${apiBase}'`
  );
  fs.writeFileSync(filePath, content);
  console.log(`  patched ${file}`);
}

console.log(`Build complete → dist/  (API_BASE=${apiBase || '(same-origin)'})`);
