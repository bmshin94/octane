import { ViewTransition, use } from 'octane';

// Fixtures for conformance/view-transition-ssr.test.ts — ports of
// facebook/react ReactDOMFizzViewTransition-test.js (the test file carries
// the per-`it` citations). Octane's @try/@pending is the directive form of
// the same Suspense tryBlock React drives with <Suspense>.

// :100 — the four annotation shapes (no Suspense involved).
export function AnnotationsApp(props) @{
	<div>
		<ViewTransition>
			<div />
		</ViewTransition>
		<ViewTransition name="foo" update="bar">
			<div />
		</ViewTransition>
		<ViewTransition update={{ something: 'a', default: 'baz' }}>
			<div />
		</ViewTransition>
		<ViewTransition name="outer" update="bar" share="pair">
			<ViewTransition>
				<div />
			</ViewTransition>
		</ViewTransition>
	</div>
}

// The resolved-content shape shared by the streaming fixtures (React's
// resolve(<div><ViewTransition><span>Content</span></ViewTransition></div>)).
export function ArmsContent(props) @{
	const text = use(props.promise) as string;
	<div>
		<ViewTransition>
			<span>{text}</span>
		</ViewTransition>
	</div>
}

// :148 — enter/exit annotations for boundaries inside Suspense: the fallback
// root exits on reveal; the content root enters when streamed in.
export function ArmsApp(props) @{
	<div>
		<>
			@try {
				<ViewTransition>
					<ArmsContent promise={props.promise} />
				</ViewTransition>
			} @pending {
				<ViewTransition>
					<div>
						<ViewTransition>
							<span>{'Loading'}</span>
						</ViewTransition>
					</div>
				</ViewTransition>
			}
		</>
	</div>
}

// :213 — both enter AND exit on the same node: the fallback's boundary is
// itself Suspense CONTENT (of an inner, non-suspending @try) sitting inside
// the outer FALLBACK arm.
export function DualApp(props) @{
	<div>
		<>
			@try {
				<ViewTransition enter="hi">
					<ArmsContent promise={props.promise} />
				</ViewTransition>
			} @pending {
				<>
					@try {
						<ViewTransition enter="hello" exit="goodbye">
							<div>
								<ViewTransition>
									<span>{'Loading'}</span>
								</ViewTransition>
							</div>
						</ViewTransition>
					} @pending {
						<></>
					}
				</>
			}
		</>
	</div>
}

// :280 — a boundary OUTSIDE (wrapping) the Suspense: it pairs the fallback
// and content across the swap, so both captures carry the same auto
// vt-name + vt-share.
export function OutsideApp(props) @{
	<div>
		<ViewTransition>
			<>
				@try {
					<ArmsContent promise={props.promise} />
				} @pending {
					<div>
						<ViewTransition>
							<span>{'Loading'}</span>
						</ViewTransition>
					</div>
				}
			</>
		</ViewTransition>
	</div>
}

export function RelayContent(props) @{
	const text = use(props.promise) as string;
	<div id="content">
		<ViewTransition parentEnter={props.relay} onParentEnter={props.handler}>
			<div id="relay">
				<ViewTransition parentEnter="deep-enter">
					<span id="deep">{text}</span>
				</ViewTransition>
			</div>
		</ViewTransition>
	</div>
}

export function RelayApp(props) @{
	<div>
		<>
			@try {
				<ViewTransition enter="page-enter">
					<RelayContent promise={props.promise} relay={props.relay} handler={props.handler} />
				</ViewTransition>
			} @pending {
				<ViewTransition exit="page-exit">
					<div id="fallback">
						<ViewTransition parentExit={props.relay} onParentExit={props.handler}>
							<div id="fallback-relay">
								<ViewTransition parentExit="deep-exit">
									<span id="fallback-deep">{'Loading'}</span>
								</ViewTransition>
							</div>
						</ViewTransition>
					</div>
				</ViewTransition>
			}
		</>
	</div>
}

export function MultipleHostsApp(props) @{
	<div>
		<ViewTransition name="siblings" update="resize">
			<>
				<div id="first">{'One'}</div>
				<div id="second">{'Two'}</div>
			</>
		</ViewTransition>
		<ViewTransition name="auto">
			<span id="automatic">{'Auto'}</span>
		</ViewTransition>
	</div>
}

export function OutsideClassesApp(props) @{
	<div>
		<ViewTransition name="outer-classes" update="resize" share="shared">
			<>
				@try {
					<ArmsContent promise={props.promise} />
				} @pending {
					<div>{'Loading'}</div>
				}
			</>
		</ViewTransition>
	</div>
}

export function StreamTextContent(props) @{
	const text = use(props.promise) as string;
	<div
		id={props.id}
		style={props.styled
			? { viewTransitionName: 'authored', viewTransitionClass: 'authored-class', color: 'red' }
			: undefined}
	>{text}</div>
}

export function StreamTextApp(props) @{
	<section>
		<>
			@try {
				<ViewTransition enter="stream-enter">
					<StreamTextContent promise={props.promise} id={props.id} styled={props.styled} />
				</ViewTransition>
			} @pending {
				<ViewTransition exit="stream-exit">
					<p>{'Loading ' + props.id}</p>
				</ViewTransition>
			}
		</>
	</section>
}

export function StreamResourceContent(props) @{
	const text = use(props.promise) as string;
	<div>
		<span>{text}</span>
		<img id="stream-eager" src="/view-transition-test-eager.png" />
		<img id="stream-lazy" src="/view-transition-test-lazy.png" loading="lazy" />
	</div>
}

export function StreamResourceApp(props) @{
	<section>
		<>
			@try {
				<ViewTransition>
					<StreamResourceContent promise={props.promise} />
				</ViewTransition>
			} @pending {
				<ViewTransition>
					<p>{'Loading'}</p>
				</ViewTransition>
			}
		</>
	</section>
}

export function SharedWaveApp(props) @{
	<section>
		<>
			@try {
				<StreamTextContent promise={props.promise} id="wave-first" />
			} @pending {
				<ViewTransition name="wave-hero" share="old-share">
					<div id="wave-old">{'Loading first'}</div>
				</ViewTransition>
			}
			@try {
				<ViewTransition name="wave-hero" share="new-share">
					<StreamTextContent promise={props.promise} id="wave-new" />
				</ViewTransition>
			} @pending {
				<p>{'Loading second'}</p>
			}
		</>
	</section>
}

function LateViewContent(props) @{
	const text = use(props.promise) as string;
	<ViewTransition enter="late-enter">
		<div id="late-content">{text}</div>
	</ViewTransition>
}

export function LateViewApp(props) @{
	<section>
		@try {
			<LateViewContent promise={props.promise} />
		} @pending {
			<p>{'Loading'}</p>
		}
	</section>
}
