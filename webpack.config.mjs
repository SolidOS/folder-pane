import path from 'path'
import { moduleRules } from './webpack.module.rules.mjs'
import { createRequire } from 'module'
import TerserPlugin from 'terser-webpack-plugin'
import CopyPlugin from 'copy-webpack-plugin'

const require = createRequire(import.meta.url)

const common = {
  mode: 'production',
  entry: './src/folderPane.ts',
  module: {
    rules: moduleRules,
  },
  externals: {
    'solid-ui': 'UI',
    'solid-logic': 'SolidLogic',
    rdflib: '$rdf',
  },
  resolve: {
    extensions: ['.js', '.ts'],
    fallback: {
      path: require.resolve('path-browserify')
    },
  },
  devtool: 'source-map',
}

const normalConfig = {
  ...common,
  mode: 'production',
  output: {
    path: path.resolve(process.cwd(), 'lib'),
    filename: 'folder-pane.js',
    library: {
      type: 'umd',
      name: 'FolderPane',
      export: 'default',
    },
    globalObject: 'this',
    clean: true,
  },
  plugins: [
    ...(common.plugins || []),
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve('src/styles'),
          to: path.resolve('lib/styles'),
        },
      ],
    }),
  ],
  optimization: {
    minimize: false,
  }
}

const minConfig = {
  ...common,
  mode: 'production',
  output: {
    path: path.resolve(process.cwd(), 'lib'),
    filename: 'folder-pane.min.js',
    library: {
      type: 'umd',
      name: 'FolderPane',
      export: 'default',
    },
    globalObject: 'this',
    clean: false,
  },
  plugins: [
    ...(common.plugins || []),
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve('src/styles'),
          to: path.resolve('lib/styles'),
        },
      ],
    }),
  ],
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false,
          },
        },
        extractComments: false,
      })
    ],
  }
}

export default [normalConfig, minConfig]
