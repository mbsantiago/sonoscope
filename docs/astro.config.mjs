// @ts-check
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightLinksValidator from 'starlight-links-validator';
import starlightThemeFlexoki from 'starlight-theme-flexoki';
import { createStarlightTypeDocPlugin } from 'starlight-typedoc';
import tailwindcss from '@tailwindcss/vite';

const [coreTypeDoc, coreSidebarGroup] = createStarlightTypeDocPlugin();
const [reactTypeDoc, reactSidebarGroup] = createStarlightTypeDocPlugin();

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Sonoscope',
			description:
				'High-performance WebGL2 & WASM audio spectrogram visualization ecosystem.',
			plugins: [
				starlightThemeFlexoki(),
				starlightLinksValidator(),
				coreTypeDoc({
					entryPoints: ['../packages/core/src/index.ts'],
					tsconfig: '../tsconfig.json',
					output: 'reference/core',
					sidebar: {
						label: '@sonoscope/core',
					},
					typeDoc: {
						readme: 'none',
						excludeInternal: true,
						excludePrivate: true,
					},
				}),
				reactTypeDoc({
					entryPoints: ['../packages/react/src/index.ts'],
					tsconfig: '../tsconfig.json',
					output: 'reference/react',
					sidebar: {
						label: '@sonoscope/react',
					},
					typeDoc: {
						readme: 'none',
						excludeInternal: true,
						excludePrivate: true,
					},
				}),
			],
			customCss: ['./src/styles/global.css', './src/styles/custom.css'],
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
						{ label: 'Waveform', slug: 'demos/waveform' },
            { label: 'Rulers', slug: 'demos/rulers' },
						{ label: 'React Components', slug: 'demos/react' },
						{ label: 'Python Widget', slug: 'demos/python' },
					],
				},
				{
					label: 'API Reference',
					items: [coreSidebarGroup, reactSidebarGroup],
				},
			],
		}),
		react(),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
