const INK = '#102033';
const PAPER = '#F4F7FB';

module.exports = ({ config }) => ({
  ...config,
  name: 'IT Hub',
  slug: 'ithub-mobile',
  owner: 'simontodd',
  scheme: 'ithub',
  version: '1.0.0',
  updates: {
    url: 'https://u.expo.dev/74d212d3-0cdb-427e-9bfd-e86f54312d94',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: false,
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'design.simontodd.ithub',
    buildNumber: '1',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        'IT Hub uses your location while you are signed in so the office can see site visits, and to notice when you arrive at or leave the office.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'IT Hub keeps your location while you are signed in, including when the phone is locked, for site visits and to notice when you arrive at or leave the office.',
      NSLocationAlwaysUsageDescription:
        'IT Hub keeps your location while you are signed in, including when the phone is locked, for site visits and to notice when you arrive at or leave the office.',
      NSCameraUsageDescription:
        'IT Hub uses the camera to scan part barcodes and photograph work on a job.',
      NSPhotoLibraryUsageDescription:
        'IT Hub uses your photos when you attach a picture to a job.',
      UIBackgroundModes: ['location', 'remote-notification'],
    },
  },
  android: {
    package: 'design.simontodd.ithub',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#141B27',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'CAMERA',
      'VIBRATE',
      'INTERNET',
      'ACCESS_NETWORK_STATE',
      'POST_NOTIFICATIONS',
    ],
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    '@react-native-community/datetimepicker',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'IT Hub uses your location while you are signed in so the office can see site visits, and to notice when you arrive at or leave the office.',
        locationAlwaysAndWhenInUsePermission:
          'IT Hub keeps your location while you are signed in, including when the phone is locked, for site visits and to notice when you arrive at or leave the office.',
        locationAlwaysPermission:
          'IT Hub keeps your location while you are signed in, including when the phone is locked, for site visits and to notice when you arrive at or leave the office.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-notifications',
      {
        color: INK,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#141B27',
        image: './assets/splash-icon.png',
        imageWidth: 240,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://portal.ithubni.com',
    eas: {
      projectId: '74d212d3-0cdb-427e-9bfd-e86f54312d94',
    },
  },
});
