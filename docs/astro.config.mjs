// @ts-check
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightThemeFlexoki from 'starlight-theme-flexoki';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Sonoscope',
			description:
				'High-performance WebGL2 & WASM audio spectrogram visualization ecosystem.',
			plugins: [
				starlightThemeFlexoki(),
				starlightTypeDoc({
					entryPoints: [
						'../packages/core/src/index.ts',
						'../packages/react/src/index.ts',
					],
					tsconfig: '../tsconfig.json',
					output: 'reference',
					sidebar: {
						label: 'API Reference',
					},
					typeDoc: {
						readme: 'none',
						excludeInternal: true,
						excludePrivate: true,
					},
				}),
			],
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
						{ label: 'Spectrogram', slug: 'demos/spectrogram' },
						{ label: 'Waveform & Multi-Track', slug: 'demos/waveform' },
						{ label: 'React Components', slug: 'demos/react' },
						{ label: 'Python Widget', slug: 'demos/python' },
					],
				},
				typeDocSidebarGroup,
			],
		}),
		react(),
	],
});
