const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (_env, argv) => {
  const dev = argv.mode !== 'production';
  const demo = Boolean(process.env.DEMO);
  return {
  entry: demo
    ? { demo: './src/demo/index.tsx' }
    : {
        background: './src/background.ts',
        collect: './src/collect.ts',
        app: './src/app/index.tsx',
      },
  output: {
    path: path.resolve(__dirname, demo ? 'dist-demo' : 'dist'),
    filename: '[name].js',
    clean: true,
  },
  resolve: { extensions: ['.ts', '.tsx', '.js'] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          // tsconfig keeps noEmit so `npm run typecheck` is a pure check;
          // the bundler needs real output.
          options: { compilerOptions: { noEmit: false } },
        },
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: demo
        ? [{ from: 'public/index.html', to: 'index.html' },
           { from: 'public/icons', to: 'icons' }]
        : [
            { from: 'public/app.html', to: 'app.html' },
            { from: 'public/manifest.json', to: 'manifest.json' },
            { from: 'public/icons', to: 'icons' },
            { from: 'src/engine/rules.json', to: 'rules.json' },
            // The dev harness never ships in a production build.
            ...(dev ? [
              { from: 'dev', to: '.' },
              { from: '../data/canvas-term239.json', to: 'dev-data.json' },
            ] : []),
          ],
    }),
  ],
  // The service worker and the injected script must stay plain, non-lazy
  // bundles: chrome.scripting.executeScript cannot load chunks.
  optimization: { splitChunks: false, runtimeChunk: false },
  devtool: 'cheap-module-source-map',
  performance: { hints: false },
  };
};
