import path from 'path';
import { fileURLToPath } from 'url';
import WebpackObfuscator from 'webpack-obfuscator';

// Yeh setup ES modules (import/export) ke liye zaroori hai
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  // 1. Kahaan se shuru karna hai
  entry: './src/index.js',

  // 2. Kahaan par output dena hai
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },

  // 3. Code ko kaise process karna hai
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },

  // 4. Plugins (Yahaan Obfuscator chalta hai)
  plugins: [
    new WebpackObfuscator({
      rotateStringArray: true, // String ko chhipata hai
      stringArray: true,
      stringArrayThreshold: 0.75,
      deadCodeInjection: true, // Faltu code add karta hai
      deadCodeInjectionThreshold: 0.4,
      controlFlowFlattening: true, // Logic ko confuse karta hai
      controlFlowFlatteningThreshold: 0.75
    }, [])
  ]
};
