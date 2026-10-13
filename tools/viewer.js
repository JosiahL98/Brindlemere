// Dev tool: the motion viewer. Serves the repo locally and opens tools/viewer/ in the browser,
// where the first-person arm and every baked villager and animal can be watched moving in 3D,
// posed by the same code the bakers use, beside the frames the game shows.
//   node tools/viewer.js            (or: cd tools && npm run viewer)
//   node tools/viewer.js --no-open  just print the address
// Edits to tools/bake/arm.mjs, bakes.mjs or bake.mjs show up on reloading the page; the game's
// frames update after rebaking (node tools/bake-viewmodel.js, node tools/bake-mesh.js <name>).
'use strict';
const { exec } = require('child_process');
const { serve } = require('./bake/common');

(async () => {
  const server = await serve(+process.env.PORT || 0);
  const url = `http://127.0.0.1:${server.address().port}/tools/viewer/index.html`;
  console.log(`Motion viewer: ${url}`);
  console.log('Ctrl+C to stop.');
  if (!process.argv.includes('--no-open')) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, (e) => { if (e) console.log('(open it in your browser)'); });
  }
})();
