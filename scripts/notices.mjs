import { readFileSync, readdirSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
const seen = new Set(); const sections = [];
function visit(name, from = process.cwd()) {
  let directory = resolve(from), root;
  for (;;) {
    const candidate = join(directory, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) { root = candidate; break; }
    const parent = dirname(directory); if (parent === directory) break; directory = parent;
  }
  if (!root) throw new Error(`Missing installed dependency ${name}`);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const id = `${pkg.name}@${pkg.version}`; if (seen.has(id)) return; seen.add(id);
  const files = readdirSync(root).filter(file => /^(license|licence|copying|notice)(\.|$)/i.test(file));
  const text = files.map(file => readFileSync(join(root, file), 'utf8')).join('\n') || (pkg.repository?.url?.includes('uiwjs/react-codemirror') ? readFileSync('assets/uiw-LICENSE.txt', 'utf8') : '');
  sections.push(`${id}\nLicense: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}\n${text || 'License metadata: ' + (pkg.repository?.url ?? pkg.homepage ?? pkg.name)}\n`);
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, root);
}
const project = JSON.parse(readFileSync('package.json', 'utf8'));
for (const dep of Object.keys(project.dependencies)) visit(dep);
copyFileSync('LICENSE', 'assets/LICENSE.txt');
writeFileSync('assets/THIRD_PARTY_NOTICES.txt', `Bundled runtime dependency notices\n\n${sections.sort().join('\n' + '='.repeat(72) + '\n\n')}`);
console.log(`Included notices for ${seen.size} runtime packages.`);
