import { readFileSync, readdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const store = JSON.parse(readFileSync('.dbx-store.json', 'utf8'));
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.id, 'io.github.ryn-mic.json-grid');
assert.equal(manifest.publisher, 'ryn-mic');
assert.equal(manifest.entrypoints.ui.entry, 'ui/index.html');
assert.equal(manifest.entrypoints.backend, undefined);
assert.deepEqual([...manifest.permissions].sort(), ['host.clipboard:read', 'host.storage']);
assert.deepEqual([...store.permissions].sort(), [...manifest.permissions].sort());
assert.equal(store.license, 'MIT');
assert.ok(existsSync('LICENSE') && existsSync(manifest.icon));
const html = readFileSync('ui/index.html', 'utf8');
for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (reference.startsWith('data:')) continue;
  assert.ok(reference.startsWith('./'), `Non-relative UI resource: ${reference}`);
  assert.ok(existsSync(`ui/${reference.slice(2)}`), `Missing resource: ${reference}`);
}
assert.ok(readdirSync('ui/assets').some(file => file.endsWith('.js')));
assert.ok(existsSync('assets/LICENSE.txt'));
assert.ok(existsSync('assets/THIRD_PARTY_NOTICES.txt'));
console.log(`Package contract verified: ${manifest.id}@${manifest.version}, static UI, minimal permissions, MIT notices.`);
