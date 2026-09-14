import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '../_helpers';
import { createRoot, flushSync, startTransition, type Root } from '../../src/index.js';
import {
	installViewTransitionMocks,
	type ViewTransitionMocks,
} from './_helpers/view-transition-mocks';
import {
	StagingLifecycleApp,
	StagingRollbackApp,
	StagingReentrantApp,
	LayoutReadinessApp,
} from './_fixtures/view-transition-matching.tsrx';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('ViewTransition staged commits', () => {
	let mocks: ViewTransitionMocks;
	let root: Root;
	let container: HTMLDivElement;
	const recoverable: unknown[] = [];
	const handles: Array<{
		update: () => void | Promise<void>;
		ready: ReturnType<typeof deferred>;
		finished: ReturnType<typeof deferred>;
	}> = [];
	beforeEach(() => {
		mocks = installViewTransitionMocks();
		if (customElements.get('vt-stage-hook') === undefined) {
			customElements.define(
				'vt-stage-hook',
				class extends HTMLElement {
					static observedAttributes = ['data-value'];
					attributeChangedCallback(_name: string, _previous: string | null, value: string) {
						(this as any).onStageAttribute?.(value);
					}
				},
			);
		}
		container = document.createElement('div');
		document.body.append(container);
		recoverable.length = 0;
		root = createRoot(container, {
			onRecoverableError: (error) => {
				recoverable.push(error);
			},
		});
		handles.length = 0;
		(document as any).startViewTransition = (input: { update: () => void | Promise<void> }) => {
			const ready = deferred();
			const finished = deferred();
			handles.push({ update: input.update, ready, finished });
			return { ready: ready.promise, finished: finished.promise, skipTransition() {} };
		};
	});
	afterEach(async () => {
		flushSync(() => root.unmount());
		for (const handle of handles) {
			handle.ready.resolve();
			handle.finished.resolve();
		}
		await Promise.resolve();
		container.remove();
		mocks.restore();
	});

	it('keeps DOM, event handlers and commit callbacks unchanged until the native update', async () => {
		const events: string[] = [];
		const clicks: string[] = [];
		await act(() =>
			root.render(StagingLifecycleApp, { value: 'before', events, clicks, children: true }),
		);
		const button = container.querySelector('button')!;
		events.length = 0;
		startTransition(() =>
			root.render(StagingLifecycleApp, { value: 'after', events, clicks, children: false }),
		);
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		expect(container.textContent).toBe('beforefirstsecond');
		expect(events).toEqual([]);
		button.click();
		expect(clicks).toEqual(['before']);
		await handles[0].update();
		expect(container.querySelector('button')).toBe(button);
		expect(container.textContent).toBe('after');
		button.click();
		expect(clicks).toEqual(['before', 'after']);
		expect(events).toContain('remove-insertion:first:true');
		expect(events).toContain('remove-layout:first:true');
		expect(events).toContain('remove-insertion:second:true');
		expect(events).toContain('remove-layout:second:true');
		expect(events).toContain('attach:after');
		expect(events).toContain('layout:after');
		expect(events.some((event) => event.startsWith('unsubscribe:'))).toBe(false);
		handles[0].ready.resolve();
		handles[0].finished.resolve();
		await vi.waitFor(() => expect(events).toContain('unsubscribe:second'));
		expect(events.filter((event) => event === 'unsubscribe:first')).toHaveLength(1);
		expect(events.filter((event) => event === 'unsubscribe:second')).toHaveLength(1);
	});

	it('fulfils every retired cleanup once if the first deletion unmounts the root', async () => {
		const events: string[] = [];
		const clicks: string[] = [];
		const onDelete = (name: string) => {
			if (name === 'first') root.unmount();
		};
		await act(() =>
			root.render(StagingLifecycleApp, {
				value: 'before',
				events,
				clicks,
				children: true,
				onDelete,
			}),
		);
		events.length = 0;
		startTransition(() =>
			root.render(StagingLifecycleApp, {
				value: 'after',
				events,
				clicks,
				children: false,
				onDelete,
			}),
		);
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		expect(events).toEqual([]);
		await handles[0].update();
		handles[0].ready.resolve();
		handles[0].finished.resolve();
		await vi.waitFor(() => expect(events).toContain('unsubscribe:second'));
		expect(container.childNodes).toHaveLength(0);
		expect(events.filter((event) => event.startsWith('remove-insertion:first:'))).toHaveLength(1);
		expect(events.filter((event) => event.startsWith('remove-layout:first:'))).toHaveLength(1);
		expect(events.filter((event) => event.startsWith('remove-insertion:second:'))).toHaveLength(1);
		expect(events.filter((event) => event.startsWith('remove-layout:second:'))).toHaveLength(1);
		expect(events.filter((event) => event === 'unsubscribe:first')).toHaveLength(1);
		expect(events.filter((event) => event === 'unsubscribe:second')).toHaveLength(1);
		expect(events).not.toContain('attach:after');
		expect(events).not.toContain('insertion:after');
		expect(events).not.toContain('layout:after');
	});

	it('tolerates deletion cleanup removing its own host before staged removal', async () => {
		const events: string[] = [];
		const clicks: string[] = [];
		const onDelete = (name: string) => {
			if (name === 'first') container.querySelector('[data-child="first"]')!.remove();
		};
		(document as any).startViewTransition = (input: { update: () => void | Promise<void> }) => {
			const ready = Promise.resolve().then(input.update);
			return { ready, finished: ready, skipTransition() {} };
		};
		await act(() =>
			root.render(StagingLifecycleApp, {
				value: 'before',
				events,
				clicks,
				children: true,
				onDelete,
			}),
		);
		events.length = 0;
		await act(() =>
			startTransition(() =>
				root.render(StagingLifecycleApp, {
					value: 'after',
					events,
					clicks,
					children: false,
					onDelete,
				}),
			),
		);
		expect(recoverable).toEqual([]);
		expect(container.textContent).toBe('after');
		expect(events.filter((event) => event.startsWith('remove-insertion:first:'))).toHaveLength(1);
		expect(events.filter((event) => event.startsWith('remove-insertion:second:'))).toHaveLength(1);
		expect(events).toContain('layout:after');
	});

	it('omits abandoned forward and rollback writes from the native mutation commit', async () => {
		await act(() => root.render(StagingRollbackApp, { value: 'before', pending: null }));
		const target = container.querySelector('[data-rollback]')!;
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((next) => records.push(...next));
		observer.observe(target, {
			attributes: true,
			attributeFilter: ['title'],
			attributeOldValue: true,
			characterData: true,
			subtree: true,
		});
		try {
			startTransition(() =>
				root.render(StagingRollbackApp, { value: 'abandoned', pending: new Promise(() => {}) }),
			);
			await vi.waitFor(() => expect(handles).toHaveLength(1));
			expect(target.textContent).toBe('before');
			expect(target.getAttribute('title')).toBe('before');
			await handles[0].update();
			handles[0].ready.resolve();
			handles[0].finished.resolve();
			await Promise.resolve();
			expect(records).toEqual([]);
			expect(container.querySelector('[data-rollback]')).toBe(target);
			expect(target.textContent).toBe('before');
			expect(target.getAttribute('title')).toBe('before');
		} finally {
			observer.disconnect();
		}
	});

	it('finishes the accepted host plan before a reentrant same-root props refresh', async () => {
		await act(() => root.render(StagingReentrantApp, { value: 'before', tail: 'old-tail' }));
		const hook = container.querySelector('vt-stage-hook')! as HTMLElement & {
			onStageAttribute?: (value: string) => void;
		};
		const tail = container.querySelector('[data-staged-tail]')!;
		let tailDuringCallback = '';
		hook.onStageAttribute = (value) => {
			if (value !== 'candidate') return;
			hook.onStageAttribute = undefined;
			tailDuringCallback = tail.textContent!;
			root.render(StagingReentrantApp, { value: 'newest', tail: 'candidate-tail' });
		};
		startTransition(() =>
			root.render(StagingReentrantApp, { value: 'candidate', tail: 'candidate-tail' }),
		);
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		await handles[0].update();
		expect(tailDuringCallback).toBe('old-tail');
		expect(container.querySelector('[data-staged-tail]')).toBe(tail);
		expect(tail.textContent).toBe('candidate-tail');
		expect(hook.getAttribute('data-value')).toBe('newest');
		handles[0].ready.resolve();
		handles[0].finished.resolve();
	});

	it('accepts a root replacement from a native mutation callback before snapshot readiness', async () => {
		await act(() => root.render(StagingReentrantApp, { value: 'before', tail: 'old-tail' }));
		const events: string[] = [];
		const hook = container.querySelector('vt-stage-hook')! as HTMLElement & {
			onStageAttribute?: (value: string) => void;
		};
		hook.onStageAttribute = (value) => {
			if (value !== 'candidate') return;
			hook.onStageAttribute = undefined;
			root.render(LayoutReadinessApp, { text: 'replacement', events, requestFont() {} });
		};
		startTransition(() =>
			root.render(StagingReentrantApp, { value: 'candidate', tail: 'candidate-tail' }),
		);
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		const update = handles[0].update();
		const outputAtSnapshot = container.textContent;
		const effectsAtSnapshot = events.slice();
		await update;
		expect(outputAtSnapshot).toBe('replacement');
		expect(effectsAtSnapshot).toEqual([
			'insertion:replacement',
			'attach:replacement',
			'layout:replacement',
		]);
		handles[0].ready.resolve();
		handles[0].finished.resolve();
	});

	it.each([false, true])(
		'holds mutation-owned work for fonts and permits later urgent interruption (%s)',
		async (urgent) => {
			const fontReady = deferred();
			const fonts = { status: 'loaded', ready: fontReady.promise };
			const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
			Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
			const events: string[] = [];
			let externalUpdate!: (value: string) => void;
			const common = {
				events,
				requestFont() {
					fonts.status = 'loading';
				},
				expose(update: (value: string) => void) {
					externalUpdate = update;
				},
			};
			try {
				await act(() =>
					root.render(StagingReentrantApp, { ...common, value: 'before', tail: 'old-tail' }),
				);
				events.length = 0;
				const hook = container.querySelector('vt-stage-hook')! as HTMLElement & {
					onStageAttribute?: (value: string) => void;
				};
				hook.onStageAttribute = (value) => {
					if (value !== 'candidate') return;
					hook.onStageAttribute = undefined;
					root.render(StagingReentrantApp, { ...common, value: 'newest', tail: 'candidate-tail' });
				};
				startTransition(() =>
					root.render(StagingReentrantApp, {
						...common,
						value: 'candidate',
						tail: 'candidate-tail',
					}),
				);
				await vi.waitFor(() => expect(handles).toHaveLength(1));
				const updated = handles[0].update();
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
				expect(fonts.status).toBe('loading');
				expect(events).toEqual([]);
				if (urgent) {
					externalUpdate('urgent-tail');
					await new Promise<void>((resolve) => setTimeout(resolve, 0));
					expect(container.textContent).toBe('urgent-tail');
					expect(events.at(-1)).toBe('layout:urgent-tail');
				}
				fonts.status = 'loaded';
				fontReady.resolve();
				await updated;
				if (!urgent) {
					expect(container.textContent).toBe('candidate-tail');
					expect(hook.getAttribute('data-value')).toBe('newest');
					expect(events.at(-1)).toBe('layout:newest');
				}
				handles[0].ready.resolve();
				handles[0].finished.resolve();
			} finally {
				fontReady.resolve();
				if (previousFonts === undefined) delete (document as any).fonts;
				else Object.defineProperty(document, 'fonts', previousFonts);
			}
		},
	);
});
