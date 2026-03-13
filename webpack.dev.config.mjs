import HtmlWebpackPlugin from 'html-webpack-plugin'
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin'
import { moduleRules } from './webpack.module.rules.mjs'

export default [
  {
    mode: 'development',
    entry: ['./dev/index.js'],
    plugins: [
      new HtmlWebpackPlugin({ template: './dev/index.html' }),
      new NodePolyfillPlugin()
    ],
    module: {
      rules: moduleRules,
    },
    resolve: {
      extensions: ['.js', '.ts'],
      alias: {
        $rdf: 'rdflib',
        rdflib: 'rdflib',
        SolidLogic: 'solid-logic',
        'solid-logic': 'solid-logic',
        UI: 'solid-ui',
        'solid-ui': 'solid-ui'
      }
    },

    devServer: {
      static: ['./dev', './test']
    },
    devtool: 'source-map',
  },
]
