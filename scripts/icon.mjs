import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire('/Users/stephendavis/.npm/_npx/705bc6b22212b352/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 180, height: 180 } });
await p.setContent(`<body style="margin:0">${fs.readFileSync('icon.svg','utf8').replace('<svg ','<svg width="180" height="180" ')}</body>`);
await p.screenshot({ path: 'icon-180.png', omitBackground: true }); await b.close(); console.log('icon ok');
