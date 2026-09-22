import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import vm from 'node:vm';

const ROOTS = ['js'];
const failures = [];

async function collect(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...await collect(full));
        else if (extname(entry.name) === '.js') files.push(full);
    }
    return files;
}

for (const root of ROOTS) {
    for (const file of await collect(root)) {
        try {
            const source = await readFile(file, 'utf8');
            new vm.Script(source, { filename: file });
            console.log('OK', relative('.', file));
        } catch (error) {
            failures.push({ file, message: error.message });
        }
    }
}

if (failures.length) {
    for (const failure of failures) {
        console.error('ERROR', failure.file, failure.message);
    }
    process.exit(1);
}
