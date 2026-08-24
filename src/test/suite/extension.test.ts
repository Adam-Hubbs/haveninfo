import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'adam-hubbs.r-haven-info';

async function hoverTextAtOffset(source: string, offset: number): Promise<string | undefined> {
	const document = await vscode.workspace.openTextDocument({ language: 'r', content: source });
	const position = document.positionAt(offset);

	const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
		'vscode.executeHoverProvider',
		document.uri,
		position
	);

	if (!hovers || hovers.length === 0) {
		return undefined;
	}

	return hovers[0].contents
		.map((content) => (typeof content === 'string' ? content : content.value))
		.join('\n');
}

/**
 * Resolves a hover position from a needle substring: the cursor is placed at
 * the needle's first character, so the needle must start with the character
 * you want to hover. Pass `occurrence: 'last'` when the needle appears more
 * than once and you want the final match (mirrors `src/extractor/fixtures.ts`).
 */
async function hoverTextAt(
	source: string,
	needle: string,
	occurrence: 'first' | 'last' = 'first'
): Promise<string | undefined> {
	const offset = occurrence === 'last' ? source.lastIndexOf(needle) : source.indexOf(needle);
	assert.ok(offset >= 0, `needle ${JSON.stringify(needle)} not found in source`);
	return hoverTextAtOffset(source, offset);
}

suite('Extension Test Suite', () => {
	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension(EXTENSION_ID);
		if (ext && !ext.isActive) {
			await ext.activate();
		}
	});

	test('extension is present and active', () => {
		const ext = vscode.extensions.getExtension(EXTENSION_ID);
		assert.ok(ext, 'extension should be found');
		assert.ok(ext!.isActive, 'extension should be active');
	});

	/**
	 * `@vscode/test-electron` runs against vanilla VS Code, which has no
	 * `positron` module -- `tryAcquirePositronApi()` always returns
	 * `undefined` here, so `HavenLabels` can never actually reach an R
	 * session. These tests can therefore only confirm that the hover
	 * pipeline (parse -> resolveReference -> HavenLabels -> Hover) wires
	 * together and fails *gracefully* (resolves to no hover, never throws)
	 * when there's no Positron/R session available -- not that a real haven
	 * label appears. `resolveReference` itself has full coverage via the
	 * `src/extractor/resolveReference.spec.ts` vitest fixtures. Verifying
	 * that a real label actually shows up requires manually testing in a
	 * live Positron window with an R session running a `haven`-labelled
	 * data frame (see the "Run Extension" launch config).
	 */
	suite('hover provider (wired end-to-end, no Positron API available in this harness)', () => {
		test('does not throw, and shows nothing, for an otherwise-resolvable reference', async () => {
			const text = await hoverTextAt('df$col', 'col');
			assert.strictEqual(text, undefined);
		});

		test('does not throw, and shows nothing, for a multi-stage pipe reference', async () => {
			const text = await hoverTextAt(
				'df |> select(x, y) |> mutate(z = x) |> arrange(x)',
				'x)',
				'last'
			);
			assert.strictEqual(text, undefined);
		});

		test('shows nothing when hovering the dataframe token itself', async () => {
			const text = await hoverTextAt('df$col', 'df');
			assert.strictEqual(text, undefined);
		});

		test('shows nothing for a call outside the data-masking registry', async () => {
			const text = await hoverTextAt('do.call(select, list(df, col))', 'col');
			assert.strictEqual(text, undefined);
		});
	});
});
