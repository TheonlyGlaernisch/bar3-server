const fs = require('fs');
const webpack = require('webpack');

const packageJson = fs.readFileSync('./package.json');
const version = JSON.parse(packageJson).version || 0;

module.exports = {
  transpileDependencies: [
    'vuetify',
    'juice',
    'cheerio',
    'htmlparser2',
    'parse5',
    'dom-serializer',
    'domhandler',
    'domutils',
    'entities',
  ],
  configureWebpack: {
    plugins: [
      new webpack.DefinePlugin({
        'process.env.PACKAGE_VERSION': JSON.stringify(version),
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: false,
      }),
    ],
    devtool: 'source-map',
  },
  chainWebpack: (config) => {
    config.plugin('html').tap((args) => {
      args[0].title = 'TRF owns this thing';
      return args;
    });

    config.plugins.delete('fork-ts-checker');

    ['ts', 'tsx'].forEach((rule) => {
      config.module.rule(rule).use('ts-loader').tap((options = {}) => ({
        ...options,
        transpileOnly: true,
      }));
    });
  },
};
