import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { javascriptObfuscator } from 'vite-plugin-javascript-obfuscator';

export default defineConfig({
  plugins: [
    react(),
    
    // Obfuscator ko yahan add karein
    javascriptObfuscator({
      // 'high-obfuscation' se shuru karein.
      // Agar app crash ho Vercel par, toh ise 'medium-obfuscation' kar dein.
      preset: 'high-obfuscation', 
      
      // Ise 'build' rakhein taaki Vercel par deploy karte time hi chale
      apply: 'build', 
      
      options: {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 1,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 1,
        debugProtection: true, // Dev tools (Inspect Element) kholne par app crash karega
        debugProtectionInterval: 4000,
        disableConsoleOutput: true, // Saare console.log hata dega
        identifierNamesGenerator: 'hexadecimal',
        log: false,
        numbersToExpressions: true,
        renameGlobals: true,
        selfDefending: true, // Code ko format/beautify karne se rokega
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: 5,
        stringArray: true,
        stringArrayCallsTransform: true,
        stringArrayEncoding: ['rc4'],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayWrappersCount: 5,
        stringArrayWrappersChainedCalls: true,
        stringArrayWrappersParametersMaxCount: 5,
        stringArrayWrappersType: 'function',
        stringArrayThreshold: 1,
        transformObjectKeys: true,
        unicodeEscapeSequence: false
      }
    })
  ],
});
