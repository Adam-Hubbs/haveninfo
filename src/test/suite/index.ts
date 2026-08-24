import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- mocha's `export =` typing needs TS's import-equals form to remain constructable.
import Mocha = require('mocha');
import { glob } from 'glob';

export function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
		timeout: 20000
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((c, e) => {
		glob('**/**.test.js', { cwd: testsRoot }).then(files => {
			files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

			try {
				mocha.run((failures: number) => {
					if (failures > 0) {
						e(new Error(`${failures} tests failed.`));
					} else {
						c();
					}
				});
			} catch (err) {
				console.error(err);
				e(err);
			}
		}).catch(err => {
			return e(err);
		});
	});
}