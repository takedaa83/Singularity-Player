# Singularity Player 2.0.2

## Downloads

- `Singularity Player Setup 2.0.2.exe` (Windows Installer)
- `Singularity Player 2.0.2.exe` (Portable Standalone)

## Changes in this Release

### Desktop Sidebar Redesign
- Multi-stop dark canvas gradient backdrop with specular top border lines and inner depth shadows.
- Redesigned branding header with dual-layer inner reflection and ambient glow shadow.
- Refined action buttons (Upload and Import) with gradient glass styling, micro-borders, and active click physics.
- Glassmorphic active navigation item states with neon capsule indicators and smooth spring animations.
- Gradient section dividers replacing hard line separators.
- Dedicated studio gradient styling and border glow for AI Studio and Sound Card.
- Cleaned playlist input field with focus glow animations, refined item hover states, and updated utility footer layout.

### Cinematic Startup Sequence
- Re-paced startup sequence (~5.5s) with gentle deceleration easing curves (`cubic-bezier(0.22, 0.61, 0.36, 1)`).
- Reduced visual noise: removed flash bursts and horizontal scanlines, softened ambient orb drift, and lowered particle density.
- Slower SVG vector outline stroke draw (2.4s) with smooth fill crossfade.
- Staggered typography blur-to-clear reveal and luminous single-highlight progress bar.
- Graceful 1.0s blur-and-scale exit transition into main player window.

### Universal Online Updater
- In-app update manager in Settings for self-hosted instances with one-click git pull, rebuild, and hot-reload.
- Non-intrusive startup update checks with in-memory caching to avoid rate limits.
- Automated CI/CD release workflow for packaging Windows installer and portable executables.
