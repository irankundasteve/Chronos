import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chronos.app',
  appName: 'Chronos',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
