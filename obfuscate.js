// obfuscate.js
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs'); 
const path = require('path');

// Vercel build environment mein build folder root mein hota hai
const buildDir = './build/static/js';

// Obfuscator ke settings
const obfuscationSettings = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayShuffle: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersType: 'var',
    stringArrayThreshold: 0.75,
    unicodeEscapeSequence: false
};

console.log('------------------------------------');
console.log('Obfuscation script shuru ho raha hai...');
console.log('------------------------------------');

try {
    const files = fs.readdirSync(buildDir);
    const jsFiles = files.filter(file => file.endsWith('.js') && !file.endsWith('.map'));

    if (jsFiles.length === 0) {
        console.warn(`Directory ${buildDir} mein koi .js file nahi mili.`);
        return;
    }

    console.log(`Obfuscate ki jaane wali .js files:`, jsFiles);

    jsFiles.forEach(file => {
        const filePath = path.join(buildDir, file);
        try {
            const code = fs.readFileSync(filePath, 'utf8');
            console.log(`${file} ko padha ja raha hai...`);
            
            const obfuscationResult = JavaScriptObfuscator.obfuscate(code, obfuscationSettings);
            const obfuscatedCode = obfuscationResult.getObfuscatedCode();
            
            fs.writeFileSync(filePath, obfuscatedCode, 'utf8');
            console.log(`✅ ${file} successfully obfuscated.`);

        } catch (readWriteErr) {
            console.error(`${file} ko process karne mein error:`, readWriteErr);
        }
    });

    console.log('------------------------------------');
    console.log('Sabhi files obfuscate ho gayi.');
    console.log('------------------------------------');

} catch (err) {
    console.error(`Build directory (${buildDir}) padhne mein error:`, err);
    console.log('Build process fail hua. Kya "npm run build" pehle chala tha?');
    process.exit(1); 
}
