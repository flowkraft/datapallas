import type { StorybookConfig } from '@storybook/angular';
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@chromatic-com/storybook',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/angular',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  staticDirs: ['../src/assets'],
  webpackFinal: (config) => {
    config.plugins = config.plugins ?? [];
    config.plugins.push(new NodePolyfillPlugin({ excludeAliases: ['console'] }));
    config.resolve = config.resolve ?? {};
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      fs: false,
      child_process: false,
      net: false,
      tls: false,
    };

    return config;
  },
};
export default config;
