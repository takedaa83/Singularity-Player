import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.singularity.music',
  appName: 'Singularity Player',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
