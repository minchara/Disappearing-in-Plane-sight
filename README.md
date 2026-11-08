# Disappearing in Plain Sight

A compact, scribble-themed camera effect. MediaPipe segments the person and recognizes gestures in the browser. Camera frames stay on device; the app does not use a microphone.

## Load as a Chrome extension

1. Run `npm install`, then `npm run build` from the project folder.
2. In Chrome, open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select this project's `dist` folder.
4. Open the extension, start the camera, step out of frame, then capture the empty background.
5. Step back in and hold an open palm to disappear. A fist restores the live image; two fingers pause or resume.

Keep the popup open while using the camera. Closing it ends the camera session.

## Run as a local website

Run `npm run dev` and open the localhost address Vite prints. Camera access requires localhost or HTTPS and browser permission.

The MediaPipe runtime and models are bundled under `public/`, so the effect does not depend on a remote model host.

## Publish on GitHub Pages

The repository includes a GitHub Actions workflow that builds the Vite app and deploys `dist` when `main` is updated. In **Settings → Pages**, set the publishing source to **GitHub Actions**. After the workflow succeeds, open `https://minchara.github.io/Disappearing-in-Plane-sight/`.
