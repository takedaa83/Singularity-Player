"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cipherDeobfuscator_1 = require("./services/cipherDeobfuscator");
const youtubeService_1 = require("./services/youtubeService");
async function test() {
    console.log('=== TEST CIPHER DEOBFUSCATION ===');
    try {
        const sts = await (0, cipherDeobfuscator_1.getSignatureTimestamp)();
        console.log('1. Extracted signatureTimestamp (sts):', sts);
        // Mock signature deobfuscation test (using a real video player hash, e.g. the active one)
        const testCipher = 's=obfuscated_sig_test_123456789_abcdef&sp=sig&url=https://rr2---sn-cvh76n7e.googlevideo.com/videoplayback?n=original_n';
        console.log('2. Mock signatureCipher:', testCipher);
        try {
            const deciphered = await (0, cipherDeobfuscator_1.deobfuscateSignature)(testCipher, 'BI9HQCzpDgQ');
            console.log('   Deciphered URL:', deciphered);
        }
        catch (e) {
            console.log('   Deobfuscation failed (expected if signature function name is different or hardcoded config is used):', e.message);
        }
        // N-transform test
        const testUrl = 'https://rr2---sn-cvh76n7e.googlevideo.com/videoplayback?n=original_n_value_123';
        console.log('3. Test URL for n-transform:', testUrl);
        const transformed = await (0, cipherDeobfuscator_1.transformNParamInUrl)(testUrl);
        console.log('   Transformed URL:', transformed);
        // Fetch stream url test
        console.log('4. Fetching actual audio stream url for BI9HQCzpDgQ...');
        const result = await (0, youtubeService_1.getAudioStreamUrl)('BI9HQCzpDgQ', 'high', true);
        console.log('   getAudioStreamUrl result:', result);
    }
    catch (err) {
        console.error('Test failed with error:', err);
    }
}
test().catch(console.error);
