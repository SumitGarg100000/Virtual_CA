import path from 'path';
import { fileURLToPath } from 'url';
import WebpackObfuscator from 'webpack-obfuscator';
import CopyWebpackPlugin from 'copy-webpack-plugin'; // <-- STEP 1: IMPORT KAREIN

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
    clean: true, // Har build se pehle 'dist' folder ko saaf karega
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

  // 4. Plugins
  plugins: [
    // Obfuscator (Pehle se hai)
    new WebpackObfuscator({
      rotateStringArray: true, 
      stringArray: true,
      stringArrayThreshold: 0.75,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.4,
      controlFlowFlattening: true, 
      controlFlowFlatteningThreshold: 0.75
    }, []),

    // <-- STEP 2: YEH NAYA PLUGIN ADD KAREIN -->
    new CopyWebpackPlugin({
      patterns: [
        // index.html ko 'dist' mein copy karo
        { from: 'index.html', to: 'index.html' }, 
        
        // app.html ko 'dist' mein copy karo
        { from: 'app.html', to: 'app.html' },     
        
        // instructions.html ko 'dist' mein copy karo
        { from: 'instructions.html', to: 'instructions.html' }, 
        
        // Poore 'js' folder ko 'dist/js' mein copy karo
        { from: 'js', to: 'js' }, 

        // Root folder se saari .png aur .jpg files ko bhi copy karo
        { from: '*.png', to: '[name][ext]' },
        { from: '*.jpg', to: '[name][ext]' }
      ]
    })
  ]
};
