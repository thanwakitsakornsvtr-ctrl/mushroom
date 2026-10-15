const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../src');

test('module dependencies use public interfaces, remain acyclic and keep shared independent', () => {
  const graph = new Map();
  const files = fs.readdirSync(source, { recursive: true }).filter((name) => name.endsWith('.js'));
  for (const name of files) {
    const owner = name.split(path.sep)[0] === 'modules' ? name.split(path.sep)[1] : null;
    if (owner && !graph.has(owner)) graph.set(owner, new Set());
    const file = path.join(source, name);
    for (const [, specifier] of fs.readFileSync(file, 'utf8').matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = require.resolve(path.resolve(path.dirname(file), specifier));
      const target = path.relative(source, resolved).split(path.sep);
      assert.ok(!(name.startsWith(`shared${path.sep}`) && target[0] === 'modules'), `${name} makes shared depend on a module`);
      if (owner && target[0] === 'modules' && target[1] !== owner) {
        assert.deepEqual(target.slice(2), ['index.js'], `${name} bypasses the ${target[1]} public interface`);
        graph.get(owner).add(target[1]);
      }
    }
  }
  const visited = new Set();
  function visit(module, trail = new Set()) {
    assert.ok(!trail.has(module), `Circular module dependency: ${[...trail, module].join(' -> ')}`);
    if (visited.has(module)) return;
    for (const dependency of graph.get(module)) visit(dependency, new Set([...trail, module]));
    visited.add(module);
  }
  for (const module of graph.keys()) visit(module);
});
