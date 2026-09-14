import { ViewTransition, useLayoutEffect, useState, type ViewTransitionInstance } from 'octane';

export interface AppProps {
	mode: 'single' | 'siblings' | 'nested' | 'mixed';
	generation: number;
	left: string;
	right: string;
	inner: string;
	page: string;
	rootName?: string;
	boundaryName?: string;
	classFollowsText?: boolean;
	scopeRefs: Record<string, { current: ViewTransitionInstance | null }>;
	onLayout: (generation: number) => void;
	onOutsideClick: () => void;
	onTransition: (id: string, instance: ViewTransitionInstance, types: string[]) => () => void;
	onPanelControl: (id: string, update: ((text: string) => void) | null) => void;
}

interface PanelProps {
	id: string;
	text: string;
	inner?: string;
	rootName?: string;
	boundaryName?: string;
	classFollowsText?: boolean;
	scopeRefs: AppProps['scopeRefs'];
	onTransition: AppProps['onTransition'];
	onPanelControl: AppProps['onPanelControl'];
}

function Panel(props: PanelProps) @{
	<ViewTransition
		scope="element"
		name={props.boundaryName}
		ref={props.scopeRefs[props.id]}
		update="scope-update"
		onUpdate={(instance, types) => props.onTransition(props.id + '-root', instance, types)}
	>
		<PanelHost {...props} />
	</ViewTransition>
}

function PanelHost(props: PanelProps) @{
	const [localText, setLocalText] = useState<string | null>(null);
	const text = localText ?? props.text;
	useLayoutEffect(() => {
		props.onPanelControl(props.id, setLocalText);
		return () => props.onPanelControl(props.id, null);
	}, []);
	<section
		id={props.id}
		class={props.classFollowsText ? text : undefined}
		title={text}
		style={props.rootName === undefined ? {} : { viewTransitionName: props.rootName }}
	>
		<h2>{text as string}</h2>
		<ViewTransition
			name="shared"
			update="child-update"
			onUpdate={(instance, types) => props.onTransition(props.id, instance, types)}
		>
			<p data-content={props.id}>{text as string}</p>
		</ViewTransition>
		@if (props.inner !== undefined) {
			<Panel
				id="inner"
				text={props.inner}
				onTransition={props.onTransition}
				onPanelControl={props.onPanelControl}
				scopeRefs={props.scopeRefs}
			/>
		}
	</section>
}

export function App(props: AppProps) @{
	useLayoutEffect(() => props.onLayout(props.generation), [props.generation]);
	<main>
		<button id="outside" onClick={props.onOutsideClick}>Outside action</button>
		@if (props.mode === 'mixed') {
			<ViewTransition
				name="shared"
				update="child-update"
				onUpdate={(instance, types) => props.onTransition('page', instance, types)}
			>
				<aside data-content="page">{props.page as string}</aside>
			</ViewTransition>
		}
		<Panel
			id="left"
			text={props.left}
			inner={props.mode === 'nested' || props.mode === 'mixed' ? props.inner : undefined}
			rootName={props.rootName}
			boundaryName={props.boundaryName}
			classFollowsText={props.classFollowsText}
			scopeRefs={props.scopeRefs}
			onTransition={props.onTransition}
			onPanelControl={props.onPanelControl}
		/>
		@if (props.mode === 'siblings' || props.mode === 'mixed') {
			<Panel
				id="right"
				text={props.right}
				onTransition={props.onTransition}
				onPanelControl={props.onPanelControl}
				scopeRefs={props.scopeRefs}
			/>
		}
	</main>
}
