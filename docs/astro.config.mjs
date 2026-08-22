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

/**
 * Remark plugin that auto-injects SandpackPlayground, SonoscopeGlobal, and loadFile
 * strictly for MDX files inside the /demos/ directory.
 */
function remarkDemoAutoImport() {
  return (tree, file) => {
    const filePath = file.history?.[0] || file.path || '';
    if (!filePath.includes('/demos/')) {
      return;
    }

    tree.children.unshift(
      {
        type: 'mdxjsEsm',
        value: `import SandpackPlayground from '/src/components/SandpackPlayground.astro';\nimport SonoscopeGlobal from '/src/components/SonoscopeGlobal.astro';\nimport { loadFile } from '/src/utils/loadFile.ts';`,
        data: {
          estree: {
            type: 'Program',
            sourceType: 'module',
            body: [
              {
                type: 'ImportDeclaration',
                specifiers: [
                  {
                    type: 'ImportDefaultSpecifier',
                    local: { type: 'Identifier', name: 'SandpackPlayground' },
                  },
                ],
                source: {
                  type: 'Literal',
                  value: '/src/components/SandpackPlayground.astro',
                  raw: "'/src/components/SandpackPlayground.astro'",
                },
              },
              {
                type: 'ImportDeclaration',
                specifiers: [
                  {
                    type: 'ImportDefaultSpecifier',
                    local: { type: 'Identifier', name: 'SonoscopeGlobal' },
                  },
                ],
                source: {
                  type: 'Literal',
                  value: '/src/components/SonoscopeGlobal.astro',
                  raw: "'/src/components/SonoscopeGlobal.astro'",
                },
              },
              {
                type: 'ImportDeclaration',
                specifiers: [
                  {
                    type: 'ImportSpecifier',
                    imported: { type: 'Identifier', name: 'loadFile' },
                    local: { type: 'Identifier', name: 'loadFile' },
                  },
                ],
                source: {
                  type: 'Literal',
                  value: '/src/utils/loadFile.ts',
                  raw: "'/src/utils/loadFile.ts'",
                },
              },
            ],
          },
        },
      },
      {
        type: 'mdxJsxFlowElement',
        name: 'SonoscopeGlobal',
        attributes: [],
        children: [],
      }
    );
  };
}

// https://astro.build/config
export default defineConfig({
	site: 'https://mbsantiago.github.io',
	base: '/sonoscope',
	devToolbar: {
		enabled: false,
	},
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
	markdown: {
		remarkPlugins: [remarkDemoAutoImport],
	},
	vite: {
		plugins: [tailwindcss()],
	},
});
