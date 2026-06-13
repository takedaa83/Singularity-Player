import fs from 'fs';
import path from 'path';
import vm from 'vm';

const CACHE_DIR = path.resolve(__dirname, '..', '..', '.cache', 'cipher');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

interface HardcodedPlayerConfig {
  sigFuncName?: string;
  sigConstantArg?: number | null;
  sigConstantArgs?: number[] | null;
  sigPreprocessFunc?: string | null;
  sigPreprocessArgs?: number[] | null;
  sigJsExpression?: string | null;
  nFuncName?: string;
  nArrayIndex?: number | null;
  nConstantArgs?: number[] | null;
  nJsExpression?: string | null;
  signatureTimestamp: number;
}

const KNOWN_PLAYER_CONFIGS: Record<string, HardcodedPlayerConfig> = {
  "74edf1a3": {
    sigFuncName: "JI",
    sigConstantArg: 48,
    sigConstantArgs: [48, 1918],
    sigPreprocessFunc: "f1",
    sigPreprocessArgs: [1, 6528],
    nFuncName: "GU",
    nArrayIndex: null,
    nConstantArgs: [6, 6010],
    signatureTimestamp: 20522
  },
  "f4c47414": {
    sigFuncName: "hJ",
    sigConstantArg: 6,
    sigConstantArgs: [6],
    sigPreprocessFunc: null,
    sigPreprocessArgs: null,
    nFuncName: "",
    nArrayIndex: null,
    nConstantArgs: null,
    signatureTimestamp: 20543
  },
  "57f5d44f": {
    sigFuncName: "",
    sigConstantArg: null,
    sigConstantArgs: null,
    sigPreprocessFunc: null,
    sigPreprocessArgs: null,
    nFuncName: "",
    nArrayIndex: null,
    nConstantArgs: null,
    signatureTimestamp: 20591
  },
  "69e2a55d": {
    sigFuncName: "_expr_sig",
    sigConstantArg: null,
    sigJsExpression: "Jf(20,3699,INPUT)",
    nFuncName: "_expr_n",
    nArrayIndex: null,
    nConstantArgs: null,
    nJsExpression: "(function(n){try{var u=new g.iE('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)",
    signatureTimestamp: 20611
  },
  "70d8066f": {
    sigFuncName: "_expr_sig",
    sigConstantArg: null,
    sigJsExpression: "Jf(20,3699,INPUT)",
    nFuncName: "_expr_n",
    nArrayIndex: null,
    nConstantArgs: null,
    nJsExpression: "(function(n){try{var u=new g.iE('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)",
    signatureTimestamp: 20611
  },
  "9d2ef9ef": {
    sigFuncName: "_expr_sig",
    sigConstantArg: null,
    sigJsExpression: "v0(35,4499,INPUT)",
    nFuncName: "_expr_n",
    nArrayIndex: null,
    nConstantArgs: null,
    nJsExpression: "(function(n){try{var u=new g.uY('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)",
    signatureTimestamp: 20607
  },
  "6fb43da5": {
    sigFuncName: "_expr_sig",
    sigConstantArg: null,
    sigJsExpression: "v0(35,4499,INPUT)",
    nFuncName: "_expr_n",
    nArrayIndex: null,
    nConstantArgs: null,
    nJsExpression: "(function(n){try{var u=new g.uY('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)",
    signatureTimestamp: 20607
  },
  "16ee6936": {
    sigFuncName: "_expr_sig",
    sigConstantArg: null,
    sigJsExpression: "mP(4,155,INPUT)",
    nFuncName: "_expr_n",
    nArrayIndex: null,
    nConstantArgs: null,
    nJsExpression: "(function(n){try{var u=new g.Yx('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)",
    signatureTimestamp: 20613
  },
  "ca366632": {
    sigFuncName: "_expr_sig",
    sigConstantArg: null,
    sigJsExpression: "mP(4,155,INPUT)",
    nFuncName: "_expr_n",
    nArrayIndex: null,
    nConstantArgs: null,
    nJsExpression: "(function(n){try{var u=new g.Yx('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)",
    signatureTimestamp: 20613
  },
  "ce74690f": {
    sigFuncName: "_expr_sig",
    sigConstantArg: null,
    sigJsExpression: "$9(2,6487,INPUT)",
    nFuncName: "_expr_n",
    nArrayIndex: null,
    nConstantArgs: null,
    nJsExpression: "(function(n){try{var u=new g.cV('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)",
    signatureTimestamp: 20612
  },
  "a5669e32": {
    sigFuncName: "_expr_sig",
    sigConstantArg: null,
    sigJsExpression: "$9(2,6487,INPUT)",
    nFuncName: "_expr_n",
    nArrayIndex: null,
    nConstantArgs: null,
    nJsExpression: "(function(n){try{var u=new g.cV('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)",
    signatureTimestamp: 20612
  },
  "6b8eecd5": {
    sigFuncName: "_expr_sig",
    sigConstantArg: null,
    sigJsExpression: "mP(4,155,INPUT)",
    nFuncName: "_expr_n",
    nArrayIndex: null,
    nConstantArgs: null,
    nJsExpression: "(function(n){try{var u=new g.Yx('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)",
    signatureTimestamp: 20613
  },
  "6ea478fa": {
    sigFuncName: "_expr_sig",
    sigConstantArg: null,
    sigJsExpression: "mP(4,155,INPUT)",
    nFuncName: "_expr_n",
    nArrayIndex: null,
    nConstantArgs: null,
    nJsExpression: "(function(n){try{var u=new g.Yx('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)",
    signatureTimestamp: 20613
  },
  "445213fb": {
    sigFuncName: "_expr_sig",
    sigConstantArg: null,
    sigJsExpression: "mP(4,155,INPUT)",
    nFuncName: "_expr_n",
    nArrayIndex: null,
    nConstantArgs: null,
    nJsExpression: "(function(n){try{var u=new g.Yx('https://x.googlevideo.com/videoplayback?n='+n,true);var t=u.get('n');return(t&&t!==n)?t:n;}catch(e){return n;}})(INPUT)",
    signatureTimestamp: 20613
  }
};

const SIG_FUNCTION_PATTERNS = [
  /&&\s*\(\s*[a-zA-Z0-9$]+\s*=\s*([a-zA-Z0-9$]+)\s*\(\s*(\d+)\s*,\s*decodeURIComponent\s*\(\s*[a-zA-Z0-9$]+\s*\)/,
  /&&\s*\(\s*[a-zA-Z0-9$]+\s*=\s*([a-zA-Z0-9$]+)\s*\(\s*(\d+)\s*,\s*decodeURIComponent\s*\(\s*[a-zA-Z0-9$]+\s*\.\s*[a-z]\s*\)/,
  /\b[cs]\s*&&\s*[adf]\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/,
  /\b[a-zA-Z0-9]+\s*&&\s*[a-zA-Z0-9]+\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/,
  /\bm=([a-zA-Z0-9$]{2,})\(decodeURIComponent\(h\.s\)\)/,
  /\bc\s*&&\s*d\.set\([^,]+\s*,\s*(?:encodeURIComponent\s*\()([a-zA-Z0-9$]+)\(/,
  /\bc\s*&&\s*[a-z]\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/
];

const N_FUNCTION_PATTERNS = [
  /\.get\("n"\)\)&&\(b=([a-zA-Z0-9$]+)(?:\[(\d+)\])?\(([a-zA-Z0-9])\)/,
  /\.get\("n"\)\)\s*&&\s*\(([a-zA-Z0-9$]+)\s*=\s*([a-zA-Z0-9$]+)(?:\[(\d+)\])?\(\1\)/,
  /\.get\("n"\);if\([a-zA-Z0-9$]+\)\s*\{[^}]*match/,
  /\(\s*([a-zA-Z0-9$]+)\s*=\s*String\.fromCharCode\(110\)/,
  /([a-zA-Z0-9$]+)\s*=\s*function\([a-zA-Z0-9]\)\s*\{[^}]*?enhanced_except_/
];

const STS_PATTERNS = [
  /signatureTimestamp['":\s]+(\d+)/,
  /sts['":\s]+(\d+)/,
  /"signatureTimestamp"\s*:\s*(\d+)/
];

const PLAYER_HASH_REGEX = /\\?\/s\\?\/player\\?\/([a-zA-Z0-9_-]+)\\?\/|jsUrl['":\s]+[^"']*?\/player\/([a-f0-9]+)\/|player_ias\.vflset\/[^/]+\/([a-f0-9]+)\//;

let activeContext: vm.Context | null = null;
let currentHash: string | null = null;
let signatureTimestamp: number = 20613; // Fallback default

// Helpers for caching
function getCacheFilePath(hash: string): string {
  return path.join(CACHE_DIR, `player_${hash}.js`);
}

function getMetaFilePath(): string {
  return path.join(CACHE_DIR, `meta.json`);
}

async function fetchPlayerHash(): Promise<string | null> {
  try {
    const res = await fetch('https://www.youtube.com/iframe_api');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const body = await res.text();
    const match = PLAYER_HASH_REGEX.exec(body);
    if (match) {
      return match[1] || match[2] || match[3] || null;
    }
  } catch (err: any) {
    console.error('[cipherDeobfuscator] Failed to fetch player hash:', err.message);
  }
  return null;
}

async function downloadPlayerJs(hash: string): Promise<string | null> {
  const url = `https://www.youtube.com/s/player/${hash}/player_ias.vflset/en_GB/base.js`;
  try {
    console.log(`[cipherDeobfuscator] Downloading player base.js from ${url}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.text();
  } catch (err: any) {
    console.error(`[cipherDeobfuscator] Failed to download player base.js for hash ${hash}:`, err.message);
  }
  return null;
}

function extractSignatureTimestamp(playerJs: string, hash: string): number {
  for (const pattern of STS_PATTERNS) {
    const match = pattern.exec(playerJs);
    if (match) {
      const sts = parseInt(match[1], 10);
      if (!isNaN(sts)) {
        return sts;
      }
    }
  }
  // Try hardcoded fallback
  const config = KNOWN_PLAYER_CONFIGS[hash];
  if (config && config.signatureTimestamp) {
    return config.signatureTimestamp;
  }
  return 20613; // default fallback
}

function getHardcodedConfig(hash: string): HardcodedPlayerConfig | null {
  return KNOWN_PLAYER_CONFIGS[hash] || null;
}

function extractSigFunctionInfo(playerJs: string, hash: string) {
  for (const pattern of SIG_FUNCTION_PATTERNS) {
    const match = pattern.exec(playerJs);
    if (match) {
      const name = match[1];
      const constantArg = match[2] ? parseInt(match[2], 10) : null;
      return { name, constantArg, isHardcoded: false };
    }
  }
  const config = getHardcodedConfig(hash);
  if (config) {
    return {
      name: config.sigFuncName,
      constantArg: config.sigConstantArg,
      constantArgs: config.sigConstantArgs,
      preprocessFunc: config.sigPreprocessFunc,
      preprocessArgs: config.sigPreprocessArgs,
      jsExpression: config.sigJsExpression,
      isHardcoded: true
    };
  }
  return null;
}

function extractNFunctionInfo(playerJs: string, hash: string) {
  for (let idx = 0; idx < N_FUNCTION_PATTERNS.length; idx++) {
    const pattern = N_FUNCTION_PATTERNS[idx];
    const match = pattern.exec(playerJs);
    if (match) {
      if (idx === 0) {
        return { name: match[1], arrayIndex: match[2] ? parseInt(match[2], 10) : null, isHardcoded: false };
      } else if (idx === 1) {
        return { name: match[2], arrayIndex: match[3] ? parseInt(match[3], 10) : null, isHardcoded: false };
      } else {
        if (pattern.source.includes('match') || pattern.source.includes('fromCharCode')) {
          if (match[1]) {
            return { name: match[1], arrayIndex: null, isHardcoded: false };
          }
        } else if (match[1]) {
          return { name: match[1], arrayIndex: null, isHardcoded: false };
        }
      }
    }
  }
  const config = getHardcodedConfig(hash);
  if (config) {
    return {
      name: config.nFuncName,
      arrayIndex: config.nArrayIndex,
      constantArgs: config.nConstantArgs,
      jsExpression: config.nJsExpression,
      isHardcoded: true
    };
  }
  return null;
}

async function initDeobfuscator(forceRefresh = false): Promise<void> {
  if (activeContext && currentHash && !forceRefresh) {
    return;
  }

  let hash = currentHash;
  let cachedJs: string | null = null;
  const metaPath = getMetaFilePath();

  // Read meta if exists to find current cached player
  if (!forceRefresh && fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta && meta.hash && meta.timestamp && (Date.now() - meta.timestamp < CACHE_TTL_MS)) {
        const cacheFilePath = getCacheFilePath(meta.hash);
        if (fs.existsSync(cacheFilePath)) {
          hash = meta.hash;
          cachedJs = fs.readFileSync(cacheFilePath, 'utf8');
          signatureTimestamp = meta.signatureTimestamp || 20613;
          console.log(`[cipherDeobfuscator] Cache hit: Using player JS hash ${hash}`);
        }
      }
    } catch (err) {
      console.warn('[cipherDeobfuscator] Failed to read meta file:', err);
    }
  }

  if (!cachedJs) {
    hash = await fetchPlayerHash();
    if (!hash) {
      console.warn('[cipherDeobfuscator] Failed to fetch player hash. Trying to use last known hash.');
      hash = Object.keys(KNOWN_PLAYER_CONFIGS)[0];
    }

    const cacheFilePath = getCacheFilePath(hash);
    if (!forceRefresh && fs.existsSync(cacheFilePath)) {
      cachedJs = fs.readFileSync(cacheFilePath, 'utf8');
      signatureTimestamp = 20613;
      console.log(`[cipherDeobfuscator] Found player on disk for hash ${hash}`);
    } else {
      cachedJs = await downloadPlayerJs(hash);
      if (!cachedJs) {
        throw new Error(`Failed to retrieve player JS for hash ${hash}`);
      }
      fs.writeFileSync(cacheFilePath, cachedJs, 'utf8');
    }
  }

  currentHash = hash!;
  signatureTimestamp = extractSignatureTimestamp(cachedJs, currentHash);

  const sigInfo = extractSigFunctionInfo(cachedJs, currentHash);
  const nFuncInfo = extractNFunctionInfo(cachedJs, currentHash);

  console.log(`[cipherDeobfuscator] Extracted info for player ${currentHash}:`);
  console.log(`  sigInfo:`, sigInfo ? `name=${sigInfo.name}, isHardcoded=${sigInfo.isHardcoded}` : 'NOT FOUND');
  console.log(`  nFuncInfo:`, nFuncInfo ? `name=${nFuncInfo.name}, isHardcoded=${nFuncInfo.isHardcoded}` : 'NOT FOUND');
  console.log(`  signatureTimestamp: ${signatureTimestamp}`);

  const exports: string[] = [];

  if (sigInfo) {
    if (sigInfo.jsExpression) {
      const expr = sigInfo.jsExpression.replace(/INPUT/g, "sig");
      exports.push(`window._cipherSigFunc = function(sig) { try { return ${expr}; } catch(e) { return null; } };`);
    } else if (sigInfo.name) {
      const sigConstArgs = (sigInfo as any).constantArgs || (sigInfo.constantArg !== null ? [sigInfo.constantArg] : null);
      const preprocessFunc = (sigInfo as any).preprocessFunc;
      const preprocessArgs = (sigInfo as any).preprocessArgs;

      if (sigConstArgs && preprocessFunc && preprocessArgs) {
        const mainArgsStr = sigConstArgs.join(", ");
        const prepArgsStr = preprocessArgs.join(", ");
        exports.push(`window._cipherSigFunc = function(sig) { return ${sigInfo.name}(${mainArgsStr}, ${preprocessFunc}(${prepArgsStr}, sig)); };`);
      } else if (sigConstArgs) {
        const argsStr = sigConstArgs.join(", ");
        exports.push(`window._cipherSigFunc = function(sig) { return ${sigInfo.name}(${argsStr}, sig); };`);
      } else {
        exports.push(`window._cipherSigFunc = typeof ${sigInfo.name} !== 'undefined' ? ${sigInfo.name} : null;`);
      }
    }
  }

  if (nFuncInfo) {
    if (nFuncInfo.jsExpression) {
      const expr = nFuncInfo.jsExpression.replace(/INPUT/g, "n");
      exports.push(`window._nTransformFunc = function(n) { try { return ${expr}; } catch(e) { return n; } };`);
    } else if (nFuncInfo.name) {
      const nConstArgs = (nFuncInfo as any).constantArgs;
      if (nConstArgs && nConstArgs.length > 0) {
        const argsStr = nConstArgs.join(", ");
        exports.push(`window._nTransformFunc = function(n) { return ${nFuncInfo.name}(${argsStr}, n); };`);
      } else {
        const nExpr = nFuncInfo.arrayIndex !== null ? `${nFuncInfo.name}[${nFuncInfo.arrayIndex}]` : nFuncInfo.name;
        exports.push(`window._nTransformFunc = typeof ${nFuncInfo.name} !== 'undefined' ? ${nExpr} : null;`);
      }
    }
  }

  const exportCode = "; " + exports.join(" ");
  const injectionPoint = "})(_yt_player);";
  let modifiedJs = modifiedJsText(cachedJs, injectionPoint, exportCode);

  const contextObject: any = {
    window: {},
    self: {},
    location: {
      hostname: 'www.youtube.com',
      href: 'https://www.youtube.com/',
      protocol: 'https:',
      origin: 'https://www.youtube.com'
    },
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    document: {
      currentScript: { src: 'base.js' }
    },
    _yt_player: {},
    XMLHttpRequest: Object.assign(
      function() {},
      {
        prototype: {
          fetch: function(a: any, b: any, c: any) {}
        }
      }
    ),
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  contextObject.window = contextObject;
  contextObject.self = contextObject;

  console.log(`[cipherDeobfuscator] Compiling player in VM script...`);
  const context = vm.createContext(contextObject);
  const script = new vm.Script(modifiedJs);
  script.runInContext(context);

  // Brute force discovery scan
  if (!contextObject._nTransformFunc) {
    console.log(`[cipherDeobfuscator] nFunc not found via regex/config. Starting brute-force scan...`);
    const testInput = "KdrqFlzJXl9EcCwlmEy";
    for (const key of Object.keys(contextObject)) {
      try {
        const fn = contextObject[key];
        if (typeof fn === 'function' && fn.length === 1) {
          const res = fn(testInput);
          if (typeof res === 'string' && res !== testInput && /^[a-zA-Z0-9_-]+$/.test(res) && res.length >= 5) {
            console.log(`[cipherDeobfuscator] Discovered n-transform function via brute-force: ${key} -> ${res}`);
            contextObject._nTransformFunc = fn;
            break;
          }
        }
      } catch (e) {}
    }
  }

  if (!contextObject._cipherSigFunc) {
    console.log(`[cipherDeobfuscator] sigFunc not found via regex/config. Starting brute-force scan...`);
    const testSig = "obfuscated_sig_test_123456789_abcdef";
    for (const key of Object.keys(contextObject)) {
      try {
        const fn = contextObject[key];
        if (typeof fn === 'function') {
          if (fn.length === 1) {
            const res = fn(testSig);
            if (typeof res === 'string' && res !== testSig && /^[a-zA-Z0-9_-]+$/.test(res) && res.length >= 20) {
              console.log(`[cipherDeobfuscator] Discovered 1-arg signature function via brute-force: ${key}`);
              contextObject._cipherSigFunc = fn;
              break;
            }
          }
        }
      } catch (e) {}
    }
  }

  activeContext = context;

  try {
    fs.writeFileSync(metaPath, JSON.stringify({
      hash: currentHash,
      timestamp: Date.now(),
      signatureTimestamp
    }), 'utf8');
  } catch (err) {
    console.warn('[cipherDeobfuscator] Failed to save meta file:', err);
  }

  console.log(`[cipherDeobfuscator] Player initialization completed successfully.`);
}

function modifiedJsText(cachedJs: string, injectionPoint: string, exportCode: string): string {
  if (cachedJs.includes(injectionPoint)) {
    return cachedJs.replace(injectionPoint, `${exportCode} })(_yt_player);`);
  } else {
    return cachedJs + "\n" + exportCode;
  }
}

export async function getSignatureTimestamp(): Promise<number> {
  await initDeobfuscator();
  return signatureTimestamp;
}

export async function deobfuscateSignature(signatureCipher: string, videoId: string): Promise<string> {
  await initDeobfuscator();

  if (!activeContext) {
    throw new Error('Deobfuscator context is not initialized');
  }

  const params = new URLSearchParams(signatureCipher);
  const obfuscatedSig = params.get('s');
  const sigParam = params.get('sp') || 'signature';
  const baseUrl = params.get('url');

  if (!obfuscatedSig || !baseUrl) {
    throw new Error('Could not parse signatureCipher parameters');
  }

  const sigFunc = activeContext._cipherSigFunc || activeContext.window?._cipherSigFunc;
  if (typeof sigFunc !== 'function') {
    throw new Error('Signature decipher function is not loaded in VM');
  }

  const deobfuscatedSig = sigFunc(obfuscatedSig);
  if (!deobfuscatedSig) {
    throw new Error('Signature decipher function returned null or empty result');
  }

  const urlObj = new URL(baseUrl);
  urlObj.searchParams.set(sigParam, deobfuscatedSig);
  return urlObj.toString();
}

export async function transformNParamInUrl(url: string): Promise<string> {
  await initDeobfuscator();

  if (!activeContext) {
    throw new Error('Deobfuscator context is not initialized');
  }

  const urlObj = new URL(url);
  const nValue = urlObj.searchParams.get('n');
  if (!nValue) {
    return url;
  }

  const nFunc = activeContext._nTransformFunc || activeContext.window?._nTransformFunc;
  if (typeof nFunc !== 'function') {
    console.warn('[cipherDeobfuscator] N-transform function is not loaded in VM, skipping transform');
    return url;
  }

  const transformedN = nFunc(nValue);
  if (transformedN && transformedN !== nValue) {
    urlObj.searchParams.set('n', transformedN);
    return urlObj.toString();
  }

  return url;
}

export async function forceReloadPlayer(): Promise<void> {
  console.log('[cipherDeobfuscator] Forcing reload of player base.js...');
  activeContext = null;
  currentHash = null;
  await initDeobfuscator(true);
}
