export const moduleRules = [
  {
    test: /\.(js|ts)$/,
    exclude: /node_modules/,
    use: ['babel-loader'],
  },
  {
    test: /\.css$/,
    exclude: /\.module\.css$/,
    use: ['style-loader', 'css-loader'],
  },
  {
    test: /\.module\.css$/,
    use: [
      'style-loader',
      {
        loader: 'css-loader',
        options: {
          modules: true
        }
      }
    ]
  },
  {
    test: /\.ttl$/,
    type: 'asset/source',
  }
]
