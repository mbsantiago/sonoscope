// @ts-check
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Sonoscope',
			description:
				'High-performance WebGL2 & WASM audio spectrogram visualization ecosystem.',
			customCss: ['./src/styles/custom.css'],
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/mbsantiago/sonoscope',
				},
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Overview', slug: 'index' },
						{ label: 'Quick Start', slug: 'guides/quick-start' },
					],
				},
				{
					label: 'Packages',
					items: [
						{ label: '@sonoscope/core', slug: 'packages/core' },
						{ label: '@sonoscope/react', slug: 'packages/react' },
						{ label: 'sonoscope (Python/Jupyter)', slug: 'packages/anywidget' },
					],
				},
				{
					label: 'Interactive Demos',
					items: [
						{ label: 'Live Spectrogram', slug: 'demos/spectrogram' },
						{ label: 'Audio Waveform', slug: 'demos/waveform' },
					],
				},
				{
					label: 'Reference',
					items: [{ autogenerate: { directory: 'reference' } }],
				},
			],
		}),
		react(),
	],
});
