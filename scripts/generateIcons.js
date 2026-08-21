const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

async function generateIcons() {
  const buildDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // Generate luxury 512x512 Master App Icon with rounded squircle and glowing ambient border
  const masterSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#120d1e"/>
        <stop offset="50%" stop-color="#08070d"/>
        <stop offset="100%" stop-color="#030206"/>
      </linearGradient>
      
      <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fa2d55"/>
        <stop offset="35%" stop-color="#8b5cf6"/>
        <stop offset="70%" stop-color="#06b6d4"/>
        <stop offset="100%" stop-color="#fa2d55"/>
      </linearGradient>

      <linearGradient id="glyphGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fa2d55"/>
        <stop offset="45%" stop-color="#8b5cf6"/>
        <stop offset="100%" stop-color="#06b6d4"/>
      </linearGradient>

      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="16" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>

      <filter id="ambient" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="35"/>
      </filter>
    </defs>

    <!-- Deep obsidian rounded squircle background -->
    <rect x="24" y="24" width="464" height="464" rx="108" fill="url(#bgGrad)"/>
    
    <!-- Luminous gradient border -->
    <rect x="24" y="24" width="464" height="464" rx="108" fill="none" stroke="url(#borderGrad)" stroke-width="8" opacity="0.85"/>

    <!-- Ambient colored glow behind glyph -->
    <circle cx="256" cy="256" r="140" fill="#8b5cf6" opacity="0.35" filter="url(#ambient)"/>
    <circle cx="210" cy="210" r="90" fill="#fa2d55" opacity="0.25" filter="url(#ambient)"/>
    <circle cx="300" cy="300" r="90" fill="#06b6d4" opacity="0.25" filter="url(#ambient)"/>

    <!-- Centered Singularity Lightning Glyph -->
    <g transform="translate(112, 98) scale(6.0)" filter="url(#glow)">
      <!-- Outer stroke path -->
      <path
        d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
        fill="url(#glyphGrad)"
      />
    </g>
  </svg>
  `;

  const masterPngPath = path.join(buildDir, 'icon.png');
  await sharp(Buffer.from(masterSvg))
    .resize(512, 512)
    .png()
    .toFile(masterPngPath);

  console.log('[IconGenerator] Generated master 512x512 icon.png');

  // Copy PWA web icons
  const publicDir = path.join(__dirname, '..', 'client', 'public');
  await sharp(Buffer.from(masterSvg)).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(Buffer.from(masterSvg)).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));

  // Generate intermediate PNG sizes for multi-layer Windows ICO
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngPaths = [];

  for (const size of sizes) {
    const p = path.join(buildDir, `icon_${size}.png`);
    await sharp(Buffer.from(masterSvg))
      .resize(size, size)
      .png()
      .toFile(p);
    pngPaths.push(p);
  }

  // Create Windows .ico with multi-resolution layers
  const icoConverter = typeof pngToIco === 'function' ? pngToIco : (pngToIco.default || pngToIco.imagesToIco);
  const icoBuffer = await icoConverter(pngPaths);
  const icoPath = path.join(buildDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'installerIcon.ico'), icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'uninstallerIcon.ico'), icoBuffer);

  console.log('[IconGenerator] Successfully generated multi-layer Windows icon.ico, installerIcon.ico, and icon.png!');

  // Cleanup temp sized pngs
  for (const p of pngPaths) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

generateIcons().catch(console.error);
