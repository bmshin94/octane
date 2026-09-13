import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const { values: args, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		baseline: { type: 'string' },
		'baseline-revision': { type: 'string' },
		candidate: { type: 'string', default: path.resolve(import.meta.dirname, '../..') },
		output: { type: 'string' },
		iterations: { type: 'string' },
		warmups: { type: 'string' },
		counts: { type: 'string' },
		scenario: { type: 'string' },
		smoke: { type: 'boolean', default: false },
		help: { type: 'boolean', default: false },
	},
});
if (args.help) {
	console.log(`Usage: node benchmarks/strong-compiler-checks/run.mjs [iterations]
  --baseline <repository-or-snapshot> --output <results.json>
  [--baseline-revision <commit>] [--candidate <repository>]
  [--iterations <count>] [--warmups <count>] [--counts 100,1000]
  [--scenario normal|ambient|alias-heavy] [--smoke]

BENCH_JSON supplies the output path when --output is omitted.
Defaults: 3 warmups, 17 pairs at 100 components, 11 pairs at 1000.
Smoke: 1 component, 0 warmups, 1 pair; validates the harness only.`);
	process.exit(0);
}
if (!args.baseline || !(args.output ?? process.env.BENCH_JSON)) {
	throw new Error('Pass --baseline and --output (or BENCH_JSON). See --help.');
}
if (positionals.length > 1 || (positionals.length && args.iterations)) {
	throw new Error('Specify the iteration count once, as --iterations or a positional argument.');
}
function integer(value, label, minimum = 1) {
	const result = Number(value);
	if (!Number.isSafeInteger(result) || result < minimum) {
		throw new Error(`${label} must be an integer >= ${minimum}.`);
	}
	return result;
}
const output = path.resolve(args.output ?? process.env.BENCH_JSON);
const roots = { baseline: path.resolve(args.baseline), candidate: path.resolve(args.candidate) };
const counts = args.counts
	? [...new Set(args.counts.split(',').map((value) => integer(value, 'counts')))]
	: args.smoke
		? [1]
		: [100, 1000];
const iterations = args.iterations ?? positionals[0];
const sampleCount = iterations === undefined ? null : integer(iterations, 'iterations');
const warmups = integer(args.warmups ?? (args.smoke ? 0 : 3), 'warmups', 0);
const scenarios = ['normal', 'ambient', 'alias-heavy'];
if (args.scenario && !scenarios.includes(args.scenario)) throw new Error('Unknown --scenario.');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const compilerRelative = 'packages/octane/src/compiler/compile.js';

function revision(root) {
	try {
		return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return null;
	}
}

// Include shared source modules and package import maps, not only strong-mode.js:
// changes to inference, parsing, printing, or an import target invalidate a run.
function sourceSnapshot(root) {
	const files = {};
	function visit(relative) {
		for (const entry of fs
			.readdirSync(path.join(root, relative), { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const name = `${relative}/${entry.name}`;
			if (entry.isDirectory()) visit(name);
			else if (entry.isFile()) files[name] = hash(fs.readFileSync(path.join(root, name)));
		}
	}
	visit('packages/octane/src');
	files['packages/octane/package.json'] = hash(
		fs.readFileSync(path.join(root, 'packages/octane/package.json')),
	);
	return { sha256: hash(JSON.stringify(files)), files };
}

function dependencies(root) {
	const require = createRequire(path.join(root, compilerRelative));
	return Object.fromEntries(
		['@tsrx/core', 'oxc-tsrx/tsrx-core-compat', 'entities', 'esrap', 'esrap/languages/tsx'].map(
			(name) => {
				const file = fs.realpathSync(require.resolve(name));
				return [name, { file, sha256: hash(fs.readFileSync(file)) }];
			},
		),
	);
}

function sourceFor(count, scenario) {
	let head = "import { useState, useEffect } from 'octane';\nconst moduleConstant = 3;";
	if (scenario === 'alias-heavy') {
		head +=
			'\nconst browser = globalThis.window;\nconst storage = browser.localStorage;\nconst doc = browser.document;\nconst { navigator: nav } = browser;\n';
		head += Array.from(
			{ length: count },
			(_, index) =>
				`const browser${index} = browser;\nconst store${index} = storage;\nconst doc${index} = doc;\nconst nav${index} = nav;`,
		).join('\n');
	}
	const rows = Array.from({ length: count }, (_, index) => {
		if (scenario === 'normal')
			return `export function Row${index}(props) @{
  const [selected, setSelected] = useState(false);
  const value = props.value + moduleConstant + ${index};
  useEffect(() => { props.onRead(value); });
  <button onClick={() => setSelected(!selected)} data-selected={selected}>{value as string}</button>
}`;
		if (scenario === 'ambient')
			return `export function Row${index}(props) @{
  const [value, setValue] = useState(() => window.localStorage.getItem('row-${index}'));
  useEffect(() => { props.onRead(globalThis.window.innerWidth, navigator.language, document.title); });
  <button onClick={() => setValue(localStorage.getItem('row-${index}'))}>{value as string}</button>
}`;
		return `export function Row${index}(props) @{
  const [value, setValue] = useState(() => store${index}.getItem('row-${index}'));
  useEffect(() => { props.onRead(browser${index}.innerWidth, nav${index}.language, doc${index}.title); });
  <button onClick={() => setValue(store${index}.getItem('row-${index}'))}>{value as string}</button>
}`;
	});
	return `${head}\n${rows.join('\n')}`;
}

const report = {
	suite: 'strong-compiler-checks',
	status: 'running',
	startedAt: new Date().toISOString(),
	harnessSha256: hash(fs.readFileSync(new URL(import.meta.url))),
	command: [process.execPath, ...process.execArgv, ...process.argv.slice(1)],
	environment: {
		node: process.version,
		v8: process.versions.v8,
		platform: process.platform,
		arch: process.arch,
		osRelease: os.release(),
		cpu: os.cpus()[0]?.model,
		cpuCount: os.cpus().length,
		nodeEnv: process.env.NODE_ENV ?? null,
	},
	config: {
		counts,
		scenarios: args.scenario ? [args.scenario] : scenarios,
		warmups,
		iterations: sampleCount,
		defaultIterations: { small: 17, large: 11 },
		smoke: args.smoke,
		timedMode: 'client',
		compilerOptions: { hmr: false, dev: false },
	},
	sources: {},
	results: [],
	targets: [],
};
function writeReport() {
	fs.mkdirSync(path.dirname(output), { recursive: true });
	fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
function stats(values) {
	return {
		...timingStatForJson(summarizeSamples(values, { scoreMode: 'mean' })),
		max: Math.max(...values),
	};
}

try {
	for (const [name, root] of Object.entries(roots)) {
		report.sources[name] = {
			root,
			revision:
				name === 'baseline' ? (args['baseline-revision'] ?? revision(root)) : revision(root),
			snapshot: sourceSnapshot(root),
			dependencies: dependencies(root),
		};
	}
	if (
		JSON.stringify(report.sources.baseline.dependencies) !==
		JSON.stringify(report.sources.candidate.dependencies)
	) {
		throw new Error(
			'Baseline and candidate must resolve the same installed compiler dependencies. Share their node_modules.',
		);
	}
	const compilers = {};
	for (const [name, root] of Object.entries(roots)) {
		compilers[name] = (await import(pathToFileURL(path.join(root, compilerRelative)).href)).compile;
	}
	writeReport();
	for (const scenario of report.config.scenarios) {
		for (const count of counts) {
			const source = sourceFor(count, scenario);
			const filename = `/src/Benchmark-${scenario}-${count}.tsrx`;
			for (const strong of [true, false]) {
				const options = { ...report.config.compilerOptions, mode: 'client', strong };
				const samples = { baseline: [], candidate: [] };
				let expectedCode;
				function measure(name) {
					const started = performance.now();
					const result = compilers[name](source, filename, options);
					const elapsed = performance.now() - started;
					const code = result.code;
					if (!code || result.diagnostics?.length)
						throw new Error(
							`${scenario}/${count}/${strong}: ${name} did not produce clean executable output.`,
						);
					expectedCode ??= code;
					if (code !== expectedCode)
						throw new Error(
							`${scenario}/${count}/${strong}: client output parity failed for ${name}.`,
						);
					return elapsed;
				}
				for (let index = 0; index < warmups; index++) {
					for (const name of index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'])
						measure(name);
				}
				const iterations = sampleCount ?? (args.smoke ? 1 : count >= 1000 ? 11 : 17);
				for (let index = 0; index < iterations; index++) {
					for (const name of index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'])
						samples[name].push(measure(name));
				}
				const serverOptions = { ...options, mode: 'server' };
				const serverBaseline = compilers.baseline(source, filename, serverOptions);
				const serverCandidate = compilers.candidate(source, filename, serverOptions);
				if (
					!serverBaseline.code ||
					serverBaseline.code !== serverCandidate.code ||
					serverBaseline.diagnostics?.length ||
					serverCandidate.diagnostics?.length
				) {
					throw new Error(`${scenario}/${count}/${strong}: server output parity failed.`);
				}
				const row = {
					count,
					scenario,
					policy: strong ? 'Strong' : 'Compat',
					sourceBytes: Buffer.byteLength(source),
					sourceSha256: hash(source),
					client: { bytes: Buffer.byteLength(expectedCode), sha256: hash(expectedCode) },
					server: {
						bytes: Buffer.byteLength(serverBaseline.code),
						sha256: hash(serverBaseline.code),
					},
					baselineMs: stats(samples.baseline),
					candidateMs: stats(samples.candidate),
					pairedRatio: stats(
						samples.candidate.map((elapsed, index) => elapsed / samples.baseline[index]),
					),
					raw: { baselineMs: samples.baseline, candidateMs: samples.candidate },
				};
				report.results.push(row);
				for (const name of ['baseline', 'candidate'])
					report.targets.push({
						name: `${name}-${row.policy.toLowerCase()}-${scenario}-${count}`,
						ops: { compile: row[`${name}Ms`] },
						meta: {
							sourceSha256: row.sourceSha256,
							client: row.client,
							server: row.server,
							pairedRatio: row.pairedRatio,
						},
					});
				console.log(
					`${row.policy} ${scenario} ${count}: ${row.baselineMs.median.toFixed(2)} → ${row.candidateMs.median.toFixed(2)} ms; paired ratio ${row.pairedRatio.median.toFixed(3)} (min ${row.pairedRatio.min.toFixed(3)}, p95 ${row.pairedRatio.p95.toFixed(3)})`,
				);
				writeReport();
			}
		}
	}
	for (const [name, root] of Object.entries(roots)) {
		if (
			report.sources[name].snapshot.sha256 !== sourceSnapshot(root).sha256 ||
			JSON.stringify(report.sources[name].dependencies) !== JSON.stringify(dependencies(root))
		) {
			throw new Error(
				`${name} sources or dependencies changed during measurement; discard these timings.`,
			);
		}
	}
	report.status = 'complete';
	report.sourcesStable = true;
} catch (error) {
	report.status = 'failed';
	report.failed = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(report.failed);
	process.exitCode = 1;
} finally {
	report.finishedAt = new Date().toISOString();
	writeReport();
}
