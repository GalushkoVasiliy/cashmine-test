// GitHub Pages serves the app from /<repo>/, so the web build needs a base URL.
// Set EXPO_BASE_URL only for that build; local dev and other hosts stay at "/".
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
