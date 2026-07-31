/**
 * Build script – produces a `dist/` folder for deployment.
 *
 * Copies the entire `public/` directory and injects the API_BASE_URL
 * into every .html file so the front-end knows where the backend lives.
 *
 * Usage:  node build.js
 *         API_BASE_URL=https://example.com node build.js
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, 'dist');
const apiBase = process.env.API_BASE_URL || '';

/** Remove any previous dist output. */
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
/** Copy public → dist. */
fs.cpSync(publicDir, distDir, { recursive: true });

/** Patch every HTML file: replace the default API_BASE placeholder with the
 *  real backend URL. */
const htmlFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.html'));
for (const file of htmlFiles) {
  const filePath = path.join(distDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  if (apiBase) {
    content = content.replace(
      /window\.API_BASE = '[^']*'/,
      `window.API_BASE = '${apiBase}'`
    );
  }
  fs.writeFileSync(filePath, content);
  console.log(`  patched ${file}`);
}

console.log(`Build complete → dist/  (API_BASE=${apiBase || '(same-origin)'})`);
