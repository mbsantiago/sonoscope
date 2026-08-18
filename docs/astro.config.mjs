// @ts-check
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightThemeFlexoki from 'starlight-theme-flexoki';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Sonoscope',
			description:
				'High-performance WebGL2 & WASM audio spectrogram visualization ecosystem.',
			plugins: [starlightThemeFlexoki()],
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
						{
							label: 'Spectrogram (TypeScript API)',
							slug: 'demos/spectrogram',
						},
						{
							label: 'Waveform & Multi-Track (TypeScript API)',
							slug: 'demos/waveform',
						},
						{ label: 'React Components Demo', slug: 'demos/react' },
						{
							label: 'Python & Jupyter Widget Demo',
							slug: 'demos/python',
						},
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
