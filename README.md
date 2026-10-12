# സിനിമക്കളി — Malayalam Movie Guessing Game

A static, Malayalam-first browser game starter for 1v1 and 2v2 movie guessing. The frontend can be hosted on GitHub Pages. Firebase Realtime Database is used for room synchronization after configuration.

## Current MVP

- Malayalam UI and responsive layout
- 1v1 and 2v2 room modes
- Room codes and player list
- Drawing pads: draw the movie title and individual Malayalam letters directly on puzzle slots
- Experimental Tesseract.js Malayalam OCR in the browser, with editable recognition output for the hidden title
- Correct letter guesses reveal every matching position
- Five incorrect unique letter guesses end the round
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
- The host draws the movie title on the answer pad, runs experimental OCR, checks/edits the recognized title, and submits it. Guessers draw a Malayalam letter directly on a blank slot and press the recognition button. A correct unique letter reveals all matching occurrences; each incorrect unique letter counts toward five. The hidden answer remains in the host-only `roomSecrets/{code}` path.

## Experimental Malayalam handwriting recognition

The page loads Tesseract.js from a public CDN and asks its Malayalam (`mal`) OCR model to read the canvas. This is an experiment, not reliable handwritten Malayalam recognition: the available OCR model is primarily intended for printed text, so handwritten characters, vowel signs, chillus, and conjuncts may be misread or not recognized at all. The creator can edit the recognized title before submitting it. Guessers should draw one large, clear character per blank; if OCR fails, clear the pad and try again. A future version should use a Malayalam handwriting-trained model or a dedicated inference service. Internet access is needed to download the OCR library and language data.

Malayalam Unicode combines consonants, vowel signs, and conjunct clusters. This prototype checks a recognized base letter and reveals all matching code points, so complex clusters may not reveal exactly as a native Malayalam reader expects.

## Security and fairness checklist before public launch

- Add Firebase App Check and stricter database rules.
- Validate room codes and room capacity server-side (e.g. Cloud Functions).
- Keep the answer inaccessible to all guessers and avoid trusting client-side scoring.
- Add reconnection, room expiry, abuse controls, and a host-transfer policy.
- Consider a server-authoritative game backend for ranked/public play.
