# സിനിമക്കളി — Malayalam Movie Guessing Game

A static, Malayalam-first browser game starter for 1v1 and 2v2 movie guessing. The frontend can be hosted on GitHub Pages. Firebase Realtime Database is used for room synchronization after configuration.

## Current MVP

- Malayalam UI and responsive layout
- 1v1 and 2v2 room modes
- Room codes and player list
- Drag/click Malayalam letter tray
- Correct guesses reveal all matching positions
- Five incorrect guesses end the round
- Local demo mode if Firebase isn't configured
- Firebase anonymous sign-in and Realtime Database room sync
- Hidden answer stored separately under `roomSecrets/{code}`; host-only read/write rule included

**Important:** This is a starter project, not a production-secure competitive game. The included database rules are a minimal example. Before public use, tighten rules so users can only join valid rooms, only the host can set the puzzle, only the guessing team can submit guesses, and scores/turns cannot be forged. The host is the only user allowed to read the answer in the provided rules. The public room writes are intentionally permissive for this prototype and must be tightened before public use. In 2v2, the host's teammate won't see the secret unless the security model is extended.

## 1. Create the GitHub repository

1. Open https://github.com/new
2. Repository name: `malayalam-movie-game`
3. Choose **Public** (needed for a simple public GitHub Pages setup), then **Create repository**.
4. Download and unzip this project.
5. Upload all files and folders to the new repository using **Add file → Upload files**, or use Git:
   ```bash
   git init
   git add .
   git commit -m "Initial Malayalam movie game"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/malayalam-movie-game.git
   git push -u origin main
   ```

## 2. Configure Firebase for online multiplayer

1. Open https://console.firebase.google.com/ and create a project.
2. In Project settings, add a **Web app** and copy its config.
3. In **Authentication → Sign-in method**, enable **Anonymous**.
4. In **Build → Realtime Database**, create a database.
5. Copy `firebase-config.js` and replace the placeholders. Change `configured: false` to `configured: true`.
6. In Realtime Database → Rules, paste the contents of `database.rules.json`, then publish the rules.
7. Add your published Pages domain under Firebase Authentication → Settings → Authorized domains if it is not already present.

Firebase web config is not a server secret, but database access must be protected by rules. Never put a service-account key or admin credential in frontend code.

## 3. Enable GitHub Pages

This repository includes `.github/workflows/pages.yml`.

1. Open repository **Settings → Pages**.
2. Under Build and deployment, select **GitHub Actions** as the source.
3. Push to `main` (or run the workflow manually from **Actions**).
4. When the workflow finishes, the page URL appears in Settings → Pages. It should look like:
   `https://YOUR_GITHUB_USERNAME.github.io/malayalam-movie-game/`

## 4. Test

- First, leave Firebase disabled and open `index.html` locally for a UI/demo test.
- For real multiplayer, deploy to GitHub Pages after configuring Firebase.
- Open the deployed page on two different browsers/devices, create a room, then join using the room code.
- A room creator is assigned to Team A. Joined players are assigned to Team B. In 2v2, two players per team are supported.
- The creator enters a movie name in Malayalam and starts the puzzle. Guessers click or drag a character onto the board. Correct guesses reveal every occurrence; wrong guesses count toward five.

## Malayalam character note

Malayalam Unicode has combining vowel signs and conjunct clusters. This starter uses Unicode code points for a first version, so certain visual combinations may be split in a way that is not linguistically ideal. A more polished version should use grapheme segmentation (`Intl.Segmenter` where available) and a carefully designed alphabet tray with independent consonants, vowels, vowel signs, chillus, anusvaram/visargam, and chandrakkala.

## Security and fairness checklist before public launch

- Add Firebase App Check and stricter database rules.
- Validate room codes and room capacity server-side (e.g. Cloud Functions).
- Keep the answer inaccessible to all guessers and avoid trusting client-side scoring.
- Add reconnection, room expiry, abuse controls, and a host-transfer policy.
- Consider a server-authoritative game backend for ranked/public play.
