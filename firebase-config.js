/*
  Firebase setup:
  1. Create a Firebase project and add a Web App.
  2. Copy the web app config values into the object below.
  3. Enable Authentication > Sign-in method > Anonymous.
  4. Create Realtime Database and apply the rules from database.rules.json.
  Leave configured:false to use local demo mode.
*/
window.FIREBASE_GAME_CONFIG = {
  configured: false,
  config: {
    apiKey: "PASTE_YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT",
    appId: "PASTE_YOUR_APP_ID"
  }
};
