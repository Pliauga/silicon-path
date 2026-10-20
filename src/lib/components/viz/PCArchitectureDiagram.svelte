<script lang="ts">
	/**
	 * The PC block diagram that replaces the worksheet's photograph.
	 *
	 * A von Neumann machine drawn as five labelled blocks around a shared bus.
	 * The blocks are not clickable SVG (that is an accessibility trap); the row
	 * of real buttons below selects a part and the diagram highlights it.
	 */
	interface Part {
		id: string;
		label: string;
		category: string;
		detail: string;
	}

	const parts: Part[] = [
		{
			id: 'cpu',
			label: 'CPU',
			category: 'Processor',
			detail:
				'Fetches instructions, decodes them, and executes them. It holds the ALU, the control unit and a small register file. Everything it works on arrives over the bus.'
		},
		{
			id: 'memory',
			label: 'Main memory (RAM)',
			category: 'Primary memory',
			detail:
				'Stores the program and its data while the machine runs. Volatile: its contents are gone when power is removed. Address and data both cross the bus.'
		},
		{
			id: 'storage',
			label: 'Secondary storage',
			category: 'Storage',
			detail:
				'SSD or hard disk. Non-volatile and much larger than RAM, but orders of magnitude slower. Programs are copied from here into RAM before they run.'
		},
		{
			id: 'io',
			label: 'Network interface',
			category: 'Input / output',
			detail:
				'Serialises frames onto the network and back. Owns a 48-bit MAC address. The keyboard and display are I/O too; the diagram shows the network card as the example.'
		},
		{
			id: 'bus',
			label: 'System bus',
			category: 'Interconnect',
			detail:
				'Three buses in one bundle: address (where), data (what), control (when). Instructions and data share it, which is the von Neumann bottleneck.'
		},
		{
			id: 'psu',
			label: 'Power & cooling',
			category: 'Support',
			detail:
				'Turns mains power into the low voltages the board needs and removes the heat that switching transistors produce. Not a computing part, but nothing runs without it.'
		}
	];

	let selected = $state<string>('cpu');

	const active = $derived(parts.find((part) => part.id === selected) ?? parts[0]);

	const is = (id: string): boolean => selected === id;

	const blockClasses = (id: string): string =>
		[
			'transition-[fill,stroke] duration-200 motion-reduce:transition-none',
			is(id)
				? 'fill-warm-tint stroke-clay'
				: 'fill-paper stroke-gray/70'
		].join(' ');
</script>

<figure class="my-8">
	<svg
		viewBox="0 0 720 400"
		role="img"
		aria-label="Block diagram of a von Neumann PC: CPU, main memory, secondary storage and network interface connected by a shared system bus, with power and cooling as support."
		class="w-full border border-transparent bg-ivory-med font-mono shadow-[0_4px_24px_rgba(0,0,0,0.03)] transition-colors duration-200 hover:border-gray/20"
	>
		<!-- bus spine -->
		<g class={blockClasses('bus')}>
			<rect x="330" y="60" width="30" height="280" rx="0" stroke-width="1.5" />
			<line x1="345" y1="60" x2="345" y2="340" stroke="currentColor" stroke-width="1" stroke-dasharray="3 5" />
		</g>
		<text x="345" y="54" text-anchor="middle" class="fill-dark-gray text-[10px]">BUS</text>

		<!-- connectors -->
		<line x1="240" y1="120" x2="330" y2="120" style="stroke: var(--rubin-gray)" stroke-width="1" />
		<line x1="240" y1="210" x2="330" y2="210" style="stroke: var(--rubin-gray)" stroke-width="1" />
		<line x1="360" y1="120" x2="430" y2="120" style="stroke: var(--rubin-gray)" stroke-width="1" />
		<line x1="360" y1="210" x2="430" y2="210" style="stroke: var(--rubin-gray)" stroke-width="1" />
		<line x1="360" y1="300" x2="430" y2="300" style="stroke: var(--rubin-gray)" stroke-width="1" />
		<line x1="185" y1="280" x2="185" y2="360" style="stroke: var(--rubin-gray)" stroke-width="1" stroke-dasharray="2 4" />
		<line x1="185" y1="360" x2="430" y2="360" style="stroke: var(--rubin-gray)" stroke-width="1" stroke-dasharray="2 4" />

		<!-- CPU -->
		<g class={blockClasses('cpu')}>
			<rect x="40" y="70" width="200" height="210" stroke-width="1.5" />
			<rect x="58" y="96" width="78" height="54" fill="none" style="stroke: var(--rubin-dark-gray)" stroke-width="1" />
			<rect x="146" y="96" width="76" height="54" fill="none" style="stroke: var(--rubin-dark-gray)" stroke-width="1" />
			<rect x="58" y="166" width="164" height="54" fill="none" style="stroke: var(--rubin-dark-gray)" stroke-width="1" />
			<text x="97" y="127" text-anchor="middle" class="fill-dark-gray text-[11px]">ALU</text>
			<text x="184" y="127" text-anchor="middle" class="fill-dark-gray text-[11px]">control</text>
			<text x="140" y="197" text-anchor="middle" class="fill-dark-gray text-[11px]">registers</text>
			<text x="140" y="254" text-anchor="middle" class="fill-slate text-[12px]">CPU</text>
		</g>

		<!-- main memory -->
		<g class={blockClasses('memory')}>
			<rect x="430" y="70" width="220" height="100" stroke-width="1.5" />
			<line x1="430" y1="94" x2="650" y2="94" style="stroke: var(--rubin-dark-gray)" stroke-width="1" />
			<text x="446" y="88" class="fill-dark-gray text-[11px]">MAIN MEMORY (RAM)</text>
			<g fill="none" style="stroke: var(--rubin-dark-gray)" stroke-width="1">
				<rect x="446" y="108" width="24" height="22" />
				<rect x="478" y="108" width="24" height="22" />
				<rect x="510" y="108" width="24" height="22" />
				<rect x="542" y="108" width="24" height="22" />
				<rect x="574" y="108" width="24" height="22" />
				<rect x="606" y="108" width="24" height="22" />
				<rect x="446" y="138" width="24" height="22" />
				<rect x="478" y="138" width="24" height="22" />
				<rect x="510" y="138" width="24" height="22" />
				<rect x="542" y="138" width="24" height="22" />
				<rect x="574" y="138" width="24" height="22" />
				<rect x="606" y="138" width="24" height="22" />
			</g>
		</g>

		<!-- secondary storage -->
		<g class={blockClasses('storage')}>
			<rect x="430" y="170" width="220" height="80" stroke-width="1.5" />
			<text x="446" y="196" class="fill-dark-gray text-[11px]">SECONDARY STORAGE</text>
			<text x="446" y="216" class="fill-dark-gray text-[10px]">SSD / HDD — non-volatile</text>
			<circle cx="620" cy="206" r="14" fill="none" style="stroke: var(--rubin-dark-gray)" stroke-width="1" />
			<circle cx="620" cy="206" r="4" style="fill: var(--rubin-dark-gray)" />
		</g>

		<!-- network interface -->
		<g class={blockClasses('io')}>
			<rect x="430" y="260" width="220" height="80" stroke-width="1.5" />
			<text x="446" y="286" class="fill-dark-gray text-[11px]">NETWORK INTERFACE</text>
			<text x="446" y="306" class="fill-dark-gray text-[10px]">frames out, frames in</text>
			<path d="M606 300 h18 l8 8 v-16 l-8 8 h-18" fill="none" style="stroke: var(--rubin-dark-gray)" stroke-width="1" />
			<text x="640" y="312" class="fill-dark-gray text-[9px]">NIC</text>
		</g>

		<!-- support -->
		<g class={blockClasses('psu')}>
			<rect x="70" y="310" width="230" height="50" stroke-width="1.5" />
			<text x="86" y="340" class="fill-dark-gray text-[11px]">POWER SUPPLY</text>
			<text x="196" y="340" class="fill-dark-gray text-[10px]">+12 V, +5 V, +3.3 V</text>
		</g>

		<!-- bus labels -->
		<text x="286" y="112" text-anchor="middle" class="fill-dark-gray text-[9px]">address</text>
		<text x="286" y="202" text-anchor="middle" class="fill-dark-gray text-[9px]">data</text>
		<text x="388" y="292" text-anchor="middle" class="fill-dark-gray text-[9px]">control</text>

		<!-- von Neumann note -->
		<text x="40" y="386" class="fill-muted-text text-[10px]">
			instructions and data share one bus — the von Neumann bottleneck
		</text>
	</svg>

	<div class="mt-4 flex flex-wrap gap-2">
		{#each parts as part (part.id)}
			<button
				type="button"
				onclick={() => (selected = part.id)}
				aria-pressed={selected === part.id}
				class="border border-gray/40 px-2.5 py-1.5 text-left font-mono text-small transition-colors duration-200 hover:border-gray hover:text-slate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate motion-reduce:transition-none"
				class:text-slate={selected === part.id}
				class:bg-ivory-med={selected === part.id}
				class:text-dark-gray={selected !== part.id}
			>
				{part.label}
			</button>
		{/each}
	</div>

	<details class="mt-4 text-small text-dark-gray">
		<summary class="cursor-pointer font-mono text-micro tracking-[0.06em] text-muted-text uppercase">
			Accessible version — part list
		</summary>
		<ul class="mt-2 list-disc space-y-1 pl-5">
			{#each parts as part (part.id)}
				<li><span class="text-slate">{part.label}</span> — {part.category}. {part.detail}</li>
			{/each}
		</ul>
	</details>

	<figcaption class="mt-3 border-l-2 border-clay pl-4">
		<p class="font-mono text-micro tracking-[0.06em] text-muted-text uppercase">{active.category}</p>
		<p class="mt-1 text-small leading-[1.65] text-dark-gray">{active.detail}</p>
	</figcaption>
</figure>