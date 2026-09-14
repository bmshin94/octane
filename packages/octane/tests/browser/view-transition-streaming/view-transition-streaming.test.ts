import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { resolve } from 'node:path';
import * as ServerRuntime from 'octane/server';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { loadServerFixture } from '../../_server-fixture.js';
import { createPipeableCollector, deferred } from '../../_server-stream.js';

const fixture = loadServerFixture(
	resolve('packages/octane/tests/conformance/_fixtures/view-transition-ssr.tsrx'),
);
let browser: Browser;
beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
});

async function streamed(name: string, props: Record<string, unknown> = {}) {
	const value = deferred<string>();
	const collector = createPipeableCollector();
	ServerRuntime.renderToPipeableStream(fixture[name], { ...props, promise: value.promise }).pipe(
		collector.destination,
	);
	const shell = collector.chunks.join('');
	value.resolve('Content');
	const complete = await collector.ended;
	return { shell, reveal: complete.slice(shell.length) };
}

async function open(shell: string) {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setContent(`<style>
body { margin: 16px; }
section, #fallback, #content { min-height: 80px; width: 240px; }
:root { view-transition-name: none; }
::view-transition-group(*) { animation-duration: 100ms; }
::view-transition-group(*.resize) { --stream-capture-class: resize; }
</style><main>${shell}</main>`);
	await page.evaluate(() => {
		const native = document.startViewTransition.bind(document);
		const records: any[] = [];
		const snapshot = () =>
			Object.fromEntries(
				Array.from(document.querySelectorAll<HTMLElement>('[id]'))
					.filter((el) => !el.closest('[hidden]'))
					.map((el) => [
						el.id,
						{ name: el.style.viewTransitionName, className: el.style.viewTransitionClass },
					]),
			);
		(document as any).startViewTransition = (options: any) => {
			const record: any = { old: snapshot() };
			record.handle = native(options);
			record.handle.ready.then(
				() => {
					record.new = snapshot();
					record.animations = document
						.getAnimations()
						.map((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement)
						.filter(Boolean);
					record.sharedClass = getComputedStyle(
						document.documentElement,
						'::view-transition-group(outer-classes)',
					).getPropertyValue('--stream-capture-class');
				},
				(error: Error) => {
					record.error = error.message;
				},
			);
			records.push(record);
			return record.handle;
		};
		(window as any).__streamCaptures = records;
	});
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			),
	);
	return { page, errors };
}

async function reveal(page: Page, html: string) {
	await page.evaluate((html) => {
		const carrier = document.createElement('div');
		carrier.innerHTML = html;
		document.body.appendChild(carrier);
		for (const script of Array.from(carrier.querySelectorAll('script'))) {
			if (script.type === 'application/json') continue;
			const executable = document.createElement('script');
			executable.textContent = script.textContent;
			script.replaceWith(executable);
		}
	}, html);
}

async function settle(page: Page, count = 1) {
	await page.waitForFunction((count) => (window as any).__streamCaptures.length === count, count);
	return page.evaluate(async () => {
		const records = (window as any).__streamCaptures;
		await Promise.all(records.map((record: any) => record.handle.finished));
		return records.map(({ old, new: next, animations, sharedClass, error }: any) => ({
			old,
			next,
			animations,
			sharedClass,
			error,
		}));
	});
}

describe.sequential('native streaming ViewTransition capture', () => {
	it('captures nested exit and parent-enter relays and restores styles after a real reveal', async () => {
		const html = await streamed('RelayApp', { relay: 'relay' });
		const { page, errors } = await open(html.shell);
		try {
			await reveal(page, html.reveal);
			const [capture] = await settle(page);
			expect(capture.error).toBeUndefined();
			expect(capture.old).toMatchObject({
				fallback: { className: 'page-exit' },
				'fallback-relay': { className: 'relay' },
				'fallback-deep': { className: 'deep-exit' },
			});
			expect(capture.next).toMatchObject({
				content: { className: 'page-enter' },
				relay: { className: 'relay' },
				deep: { className: 'deep-enter' },
			});
			for (const { name } of Object.values(capture.next) as { name: string }[]) {
				expect(capture.animations).toContain(`::view-transition-new(${name})`);
			}
			expect(await page.locator('#content').textContent()).toContain('Content');
			expect(await page.locator('#fallback').count()).toBe(0);
			expect(
				await page.evaluate(() =>
					Array.from(document.querySelectorAll<HTMLElement>('[id]')).every(
						(el) => !el.style.viewTransitionName && !el.style.viewTransitionClass,
					),
				),
			).toBe(true);
			expect(await page.evaluate(() => (document as any).__octaneViewTransition)).toBeNull();
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('uses the wrapping update class on the actual shared capture pseudo-element', async () => {
		const html = await streamed('OutsideClassesApp');
		const { page, errors } = await open(html.shell);
		try {
			await reveal(page, html.reveal);
			const [capture] = await settle(page);
			expect(capture.error).toBeUndefined();
			expect(capture.animations).toContain('::view-transition-group(outer-classes)');
			expect(capture.sharedClass).toBe('resize');
			expect(await page.locator('main').textContent()).toContain('Content');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('pairs an explicit name between sibling streaming boundaries in one native capture', async () => {
		const html = await streamed('SharedWaveApp');
		const { page, errors } = await open(html.shell);
		try {
			await reveal(page, html.reveal);
			const [capture] = await settle(page);
			expect(capture.error).toBeUndefined();
			expect(capture.old['wave-old']).toEqual({ name: 'wave-hero', className: 'old-share' });
			expect(capture.next['wave-new']).toEqual({ name: 'wave-hero', className: 'new-share' });
			expect(capture.animations).toContain('::view-transition-group(wave-hero)');
			expect(await page.locator('#wave-first').textContent()).toBe('Content');
			expect(await page.locator('#wave-new').textContent()).toBe('Content');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('gives independently composed streams distinct automatic capture names', async () => {
		const first = await streamed('OutsideApp');
		const second = await streamed('OutsideApp');
		const { page, errors } = await open(first.shell + second.shell);
		try {
			const names = await page
				.locator('main [vt-name]')
				.evaluateAll((elements) => elements.map((el) => el.getAttribute('vt-name')!));
			expect(names).toHaveLength(2);
			expect(new Set(names).size).toBe(2);
			await reveal(page, first.reveal + second.reveal);
			const [capture] = await settle(page);
			expect(capture.error).toBeUndefined();
			for (const name of names)
				expect(capture.animations).toContain(`::view-transition-group(${name})`);
			expect(
				await page
					.locator('main [vt-name]')
					.evaluateAll((elements) => elements.map((el) => el.getAttribute('vt-name')!)),
			).toEqual(names);
			expect(await page.locator('main [vt-name]').allTextContents()).toEqual([
				'Content',
				'Content',
			]);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});
});
