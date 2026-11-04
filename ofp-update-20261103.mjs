// Add one lecture to the existing OFP Vite app. Never removes existing files.
// Run from the OFP project root: node ofp-update-20261103.mjs
// After npm run build: node ofp-update-20261103.mjs --verify
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const ID = 'pain-types-20261103';
const PAGE = 'three-types-of-pain-20261103.html';
const TITLE = '2026.11.3. What’s in a name? Making Sense of the Three Types of Pain（名前に何が含まれているのか？3つの痛みのタイプを理解する）';
const PAGE_SHA256 = 'ffdbc7906937473ea3b058d09e298bc1358c62884809f3d4bb84bf365c41862c';
const SOURCE_COMMIT = 'd20fa75abcce41893a1ddd4ef1a1236575843641';
const AUDIT = '.ofp-update-20261103-audit.json';
const BACKUP = '.ofp-update-20261103-backup';
const root = process.cwd();
const hash = b => createHash('sha256').update(b).digest('hex');
const exists = async p => { try { await fs.access(p); return true; } catch { return false; } };
const assert = (ok, message) => { if (!ok) throw new Error(message); };

async function scan(directory) {
  const found = {};
  async function visit(dir, prefix = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const absolute = path.join(dir, entry.name);
      assert(!entry.isSymbolicLink(), 'Refusing symbolic link: ' + relative);
      if (entry.isDirectory()) await visit(absolute, relative + '/');
      else if (entry.isFile()) found[relative] = hash(await fs.readFile(absolute));
    }
  }
  await visit(directory);
  return found;
}

async function verify() {
  const audit = JSON.parse(await fs.readFile(AUDIT, 'utf8'));
  const app = await fs.readFile('src/App.tsx', 'utf8');
  assert(hash(Buffer.from(app)) === audit.appAfterSha256, 'App source changed after the additive patch');
  assert(hash(await fs.readFile(path.join('public', PAGE))) === PAGE_SHA256, 'Protected page checksum mismatch');
  const now = await scan('public');
  for (const [file, digest] of Object.entries(audit.publicBefore)) {
    assert(now[file] === digest, 'Existing public file changed or missing: ' + file);
  }
  for (const [file, digest] of Object.entries(now)) {
    assert(hash(await fs.readFile(path.join('dist', file))) === digest, 'Built public file changed or missing: ' + file);
  }
  const index = await fs.readFile('dist/index.html', 'utf8');
  const bundlePaths = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  const bundles = await Promise.all(bundlePaths.map(p => fs.readFile(path.join('dist', p), 'utf8')));
  assert(bundles.some(b => b.includes(ID) && b.includes(PAGE) && b.includes(TITLE)), 'New lecture missing from built app');
  assert(bundles.some(b => b.includes('aaop-2026') && b.includes('ofp-reserved-room-unlocked')), 'Existing menu or authentication missing');
  console.log(JSON.stringify({ status: 'VERIFIED', existingPublicFilesUnchanged: Object.keys(audit.publicBefore).length, publicFilesCopiedExactly: Object.keys(now).length, appOriginalBytesRetained: true, newLectureId: ID }));
}

async function patch() {
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  assert(pkg.name === 'ofp-reserved-room', 'Wrong project: refusing to modify files');
  const require = createRequire(path.join(root, 'package.json'));
  const ts = require('typescript');
  const appPath = 'src/App.tsx';
  const original = await fs.readFile(appPath, 'utf8');
  const parse = text => ts.createSourceFile(appPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const source = parse(original);
  assert(source.parseDiagnostics.length === 0, 'Existing App.tsx has syntax errors');
  const prop = (object, name) => object.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source).replace(/^["']|["']$/g, '') === name);
  const objectId = object => {
    if (!ts.isObjectLiteralExpression(object)) return null;
    const p = prop(object, 'id');
    return p && ts.isStringLiteralLike(p.initializer) ? p.initializer.text : null;
  };
  const arrays = [];
  function walk(node) {
    if (ts.isArrayLiteralExpression(node) && node.elements.some(e => objectId(e) === 'aaop-2026')) arrays.push(node);
    ts.forEachChild(node, walk);
  }
  walk(source);
  assert(arrays.length === 1, 'Expected exactly one existing lecture menu; found ' + arrays.length);
  const menu = arrays[0];
  const alreadyPresent = menu.elements.some(e => objectId(e) === ID);
  const insertion = '\n    {\n      id: ' + JSON.stringify(ID) + ',\n      title: ' + JSON.stringify(TITLE) + ',\n      description: ["2026年11月3日の講演資料です。", "パスワードを入力して資料を開きます。"],\n      href: "./' + PAGE + '",\n    },';
  const position = menu.getStart(source) + 1;
  const changed = alreadyPresent ? original : original.slice(0, position) + insertion + original.slice(position);
  assert(parse(changed).parseDiagnostics.length === 0, 'Patched source has syntax errors');
  if (!alreadyPresent) assert(changed.slice(0, position) + changed.slice(position + insertion.length) === original, 'Original source was not preserved');
  else assert(changed.includes(TITLE) && changed.includes('./' + PAGE), 'Existing lecture differs; refusing to replace it');
  const response = await fetch('https://raw.githubusercontent.com/mxe050/2026AAOP/' + SOURCE_COMMIT + '/' + PAGE, { signal: AbortSignal.timeout(30000) });
  assert(response.ok, 'Protected HTML could not be fetched: HTTP ' + response.status);
  const protectedHtml = Buffer.from(await response.arrayBuffer());
  assert(hash(protectedHtml) === PAGE_SHA256, 'Downloaded HTML does not match the reviewed encrypted file');
  const pagePath = path.join('public', PAGE);
  if (await exists(pagePath)) assert(hash(await fs.readFile(pagePath)) === PAGE_SHA256, 'Different file already exists at the new page path');
  const publicBefore = await scan('public');
  const backupPath = path.join(BACKUP, 'App.tsx');
  await fs.mkdir(BACKUP, { recursive: true });
  if (!alreadyPresent && !(await exists(backupPath))) await fs.writeFile(backupPath, original, { flag: 'wx' });
  if (!(await exists(pagePath))) await fs.writeFile(pagePath, protectedHtml, { flag: 'wx' });
  if (!alreadyPresent) await fs.writeFile(appPath, changed);
  const existingAudit = await exists(AUDIT) ? JSON.parse(await fs.readFile(AUDIT, 'utf8')) : null;
  const audit = {
    version: 1,
    lectureId: ID,
    originalSourcePreserved: true,
    originalAppSha256: existingAudit?.originalAppSha256 || hash(Buffer.from(original)),
    appAfterSha256: hash(Buffer.from(changed)),
    publicBefore: existingAudit?.publicBefore || publicBefore,
    protectedPageSha256: PAGE_SHA256,
    originalMenuIds: menu.elements.map(objectId).filter(id => id && id !== ID),
    pageSourceCommit: SOURCE_COMMIT
  };
  await fs.writeFile(AUDIT, JSON.stringify(audit, null, 2) + '\n');
  console.log(JSON.stringify({ status: alreadyPresent ? 'ALREADY_APPLIED' : 'APPLIED', originalMenuItemsPreserved: audit.originalMenuIds.length, existingPublicFiles: Object.keys(audit.publicBefore).length, originalSourceBytes: Buffer.byteLength(original), addedMenuItems: alreadyPresent ? 0 : 1 }));
}

try {
  if (process.argv.includes('--verify')) await verify();
  else await patch();
} catch (error) {
  console.error('OFP update stopped:', error.message);
  process.exitCode = 1;
}
