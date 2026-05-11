const fs = require('fs');
const packageJson = fs.readFileSync('./package.json');
const version = JSON.parse(packageJson).version || 0;
const webpack = require('webpack');

module.exports = {
  "transpileDependencies": [
    "vuetify",
    "juice",
    "cheerio",
    "htmlparser2",
    "parse5",
    "dom-serializer",
    "domhandler",
    "domutils",
    "entities"
  ],
  configureWebpack: {
    plugins: [
        new webpack.DefinePlugin({
            'process.env.PACKAGE_VERSION': '"' + version + '"',
        })
    ],

    devtool: 'source-map'
  },
  chainWebpack: (config) => {
    config.plugin('html').tap((args) => {
      args[0].title = 'TRF owns this thing';
      return args;
    });
  },
}
