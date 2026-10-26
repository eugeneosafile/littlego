// Adds settings that must not live in git. Everything else stays in app.json.
//
// GOOGLE_MAPS_ANDROID_KEY: the Google Maps key for the Android map. Stored as an EAS
// environment variable (expo.dev → littlego → Environment variables, "preview" and
// "production"), so EAS Build reads it here. The key is restricted in Google Cloud to
// package com.littlego.app, our signing certificate and the Maps SDK for Android only.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_ANDROID_KEY;
  if (!key && process.env.EAS_BUILD_PLATFORM === 'android') {
    console.warn('GOOGLE_MAPS_ANDROID_KEY is not set: the Android map will be blank in this build.');
  }
  return {
    ...config,
    android: {
      ...config.android,
      config: { ...config.android?.config, googleMaps: { apiKey: key ?? '' } },
    },
  };
};
