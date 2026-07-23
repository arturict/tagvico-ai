const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

const targets = [
  'views/partials/app-shell.ejs',
  'views/partials/app-head.ejs',
  'views/partials/app-sidebar.ejs',
  'views/login.ejs'
];

let failed = 0;
for (const rel of targets) {
  const file = path.join(process.cwd(), rel);
  if (!fs.existsSync(file)) {
    console.log('MISSING', rel);
    failed++;
    continue;
  }
  const src = fs.readFileSync(file, 'utf8');
  try {
    ejs.compile(src, { filename: file, client: false, compileDebug: false });
    console.log('OK   ', rel);
  } catch (error) {
    console.log('FAIL ', rel, '=>', error.message);
    failed++;
  }
}
if (failed) process.exit(1); else console.log('PASS ejs compile');
