import {
	ViewTransition,
	createElement,
	useInsertionEffect,
	useLayoutEffect,
	useEffect,
	useState,
	useRef,
	type ViewTransitionProps,
} from 'octane';

export interface MatchingProps {
	text: string;
	show?: boolean;
	transition: ViewTransitionProps;
	style?: Record<string, string>;
}

export function MatchingApp(props: MatchingProps) @{
	<>
		<ViewTransition>
			<aside>{props.text as string}</aside>
		</ViewTransition>
		@if (props.show !== false) {
			<ViewTransition {...props.transition}>
				<div data-vt-target="target" style={props.style}>{props.text as string}</div>
			</ViewTransition>
		}
	</>
}

export function NestedShareApp(props) @{
	<>
		@if (props.page) {
			<ViewTransition enter="page-enter">
				<main>
					<ViewTransition name="hero" enter="hero-enter" share="hero-share">
						<div data-vt-target="hero">{'New hero'}</div>
					</ViewTransition>
				</main>
			</ViewTransition>
		} @else {
			<ViewTransition name="hero" share="hero-share" onShare={props.onShare} onExit={props.onExit}>
				<div data-vt-target="hero">{'Old hero'}</div>
			</ViewTransition>
		}
	</>
}

export function MultiHostLayoutApp(props) @{
	<>
		<aside id="layout-driver">{props.offset as string}</aside>
		<ViewTransition onUpdate={props.onUpdate}>
			<>
				<div data-vt-target="first">{'First'}</div>
				<div data-vt-target="second">{'Second'}</div>
			</>
		</ViewTransition>
	</>
}

export function HandlerRelayApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition enter="outer" exit="outer">
				<section>
					<ViewTransition default="none" onParentEnter={props.onEnter} onParentExit={props.onExit}>
						<div>{'Inner'}</div>
					</ViewTransition>
				</section>
			</ViewTransition>
		}
	</>
}

export function LayoutReadinessApp(props) @{
	useInsertionEffect(() => {
		props.events.push('insertion:' + props.text);
		if (props.text === 'after') props.requestFont();
	}, [props.text]);
	useLayoutEffect(() => {
		props.events.push('layout:' + props.text);
		props.onLayout?.(props.text);
		return () => props.events.push('destroy:' + props.text);
	}, [props.text]);
	<ViewTransition>
		<div
			ref={(node) => {
				props.events.push(node === null ? 'detach:' + props.text : 'attach:' + props.text);
			}}
		>{props.text as string}</div>
	</ViewTransition>
}

function DeferredSubscription(props) @{
	useEffect(() => {
		props.events.push('subscribe');
		return () => props.events.push('unsubscribe');
	}, []);
	<span>{'subscribed'}</span>
}

export function DeferredOwnershipApp(props) @{
	const [derived, setDerived] = useState(0);
	useInsertionEffect(() => {
		if (props.generation === 1) props.requestFont?.();
	}, [props.generation]);
	useLayoutEffect(() => {
		props.events.push('layout:' + props.generation + ':' + derived);
		if (props.cascade && derived < props.generation) setDerived(props.generation);
	}, [props.generation, derived, props.cascade]);
	useEffect(() => {
		props.events.push('passive:' + props.generation + ':' + derived);
	}, [props.generation, derived]);
	<ViewTransition>
		<div>
			{props.generation as string}
			{String(derived)}
			@if (props.subscription) {
				<DeferredSubscription events={props.events} />
			}
		</div>
	</ViewTransition>
}

function StagedChild(props) @{
	const node = useRef<HTMLDivElement | null>(null);
	useInsertionEffect(() => {
		props.events.push('insert:' + props.name);
		return () => {
			props.events.push('remove-insertion:' + props.name + ':' + node.current?.isConnected);
			props.onDelete?.(props.name);
		};
	}, []);
	useLayoutEffect(() => {
		props.events.push('layout:' + props.name);
		return () => props.events.push('remove-layout:' + props.name + ':' + node.current?.isConnected);
	}, []);
	useEffect(() => {
		props.events.push('subscribe:' + props.name);
		return () => props.events.push('unsubscribe:' + props.name);
	}, []);
	<div ref={node} data-child={props.name}>{props.name as string}</div>
}

export function StagingLifecycleApp(props) @{
	useInsertionEffect(() => {
		props.events.push('insertion:' + props.value);
		return () => props.events.push('destroy-insertion:' + props.value);
	}, [props.value]);
	useLayoutEffect(() => {
		props.events.push('layout:' + props.value);
		return () => props.events.push('destroy-layout:' + props.value);
	}, [props.value]);
	<ViewTransition>
		<section>
			<button
				onClick={() => props.clicks.push(props.value)}
				ref={(node) => props.events.push((node === null ? 'detach:' : 'attach:') + props.value)}
			>{props.value as string}</button>
			@if (props.children) {
				<>
					<StagedChild name="first" events={props.events} onDelete={props.onDelete} />
					<StagedChild name="second" events={props.events} onDelete={props.onDelete} />
				</>
			}
		</section>
	</ViewTransition>
}

function StagedSuspender(props) @{
	if (props.pending !== null) throw props.pending;
	<span>{'ready'}</span>
}

export function StagingRollbackApp(props) @{
	<ViewTransition>
		<section>
			<span data-rollback="target" title={props.value}>{props.value as string}</span>
			<StagedSuspender pending={props.pending} />
		</section>
	</ViewTransition>
}

function StagingReentrantTail(props) @{
	<span data-staged-tail="target">{props.tail as string}</span>
}

export function StagingReentrantApp(props) @{
	const [external, setExternal] = useState('');
	props.expose?.(setExternal);
	useInsertionEffect(() => {
		if (props.value === 'candidate') props.requestFont?.();
	}, [props.value]);
	useLayoutEffect(() => {
		props.events?.push('layout:' + (external || props.value));
	}, [props.value, external]);
	<ViewTransition>
		<section>
			{createElement('vt-stage-hook', { 'data-value': props.value })}
			<StagingReentrantTail tail={external || props.tail} />
		</section>
	</ViewTransition>
}
