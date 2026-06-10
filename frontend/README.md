# StreamAngle V2 Frontend - Full Studio Merge

This frontend keeps the V2 role-based business system and restores the full V1 production studio engine.

## Included

- Creator, Company, and Admin dashboards
- Wallet + eSewa-ready top-up screens
- Company sponsored ad creation
- Admin ad approval/settings/wallet actions
- Full V1 studio engine restored:
  - multi-camera WebRTC studio
  - camera join page
  - viewer/watch page
  - canvas production output
  - layout switching
  - overlays: text, scorecards, ads, image, replay, video link
  - commentary microphone
  - screen share
  - camera zoom
  - local camera clip recording/download
  - audio source/mute controls
  - RTMP destination controls
  - worker-based canvas timer
- V2 sponsored ads added inside the studio under the Ads panel

## Run

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

## Backend expected

Run the fixed V2 backend on:

```txt
http://localhost:8080
```

Default frontend env:

```env
VITE_API_URL=http://localhost:8080/api
VITE_WS_URL=ws://localhost:8080/ws
VITE_STREAM_WS_URL=ws://localhost:8080/api/stream/ws
VITE_PUBLIC_UPLOAD_BASE=http://localhost:8080
```

## Important

- FFmpeg must be installed on the backend machine for RTMP Go Live.
- Sponsored ad payouts are credited only after completing the ad placement.
- eSewa wallet credit must be verified by backend; frontend does not fake wallet balance.
