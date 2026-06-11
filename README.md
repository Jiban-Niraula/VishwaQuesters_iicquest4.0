# Vision Cast

Vision Cast is a live streaming and event platform. It allows creators to create events, connect cameras, manage stream destinations, and run live sessions. Companies can upload ads, and creators can earn from approved ads during their streams. Admin can manage users, ads, revenue, wallet actions, and platform settings.

The project has two main parts:

- `frontend` - React + Vite web app
- `server` - Go backend API using Gin, GORM, PostgreSQL, WebSocket, and WebRTC support

## Main Idea

This project is made for online live events. A creator can create an event and share a watch link with viewers. The creator can also use the studio page to manage the stream. Companies can add advertisements to the platform. Admin checks and approves those ads. When ads are played and completed, the creator receives wallet balance based on the platform rules.

## User Roles

### Admin

Admin controls the platform. Admin can:

- View users
- View and approve ads
- Check revenue
- Manage platform settings
- Add test wallet balance to users
- View events and transactions

### Creator

Creator is the person who creates and manages live events. Creator can:

- Create events
- Open studio for an event
- Connect camera or streaming source
- Add stream destinations
- View wallet balance
- Manage subscription
- Play available ads during stream

### Company

Company is the advertiser. Company can:

- Create ads
- Upload ad media
- Set ad play limit and budget
- View own ads
- View wallet balance

### Public Viewer

Public viewers do not need to login. They can:

- Open event watch page
- Watch stream using event code

## Main Features

- User registration and login
- Role based dashboard for admin, creator, and company
- Event creation and event watch page
- Creator studio page
- Camera page for connecting camera
- WebSocket based stream communication
- Stream destinations management
- Ads marketplace
- Company ad upload
- Admin ad approval
- Wallet balance and transactions
- Subscription support
- eSewa payment flow pages
- Platform pricing and settings

## Project Folder Structure

```txt
VishwaQuesters_iicquest4.0/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   ├── auth/
│   │   │   ├── company/
│   │   │   ├── creator/
│   │   │   ├── payments/
│   │   │   └── public/
│   │   ├── shared/
│   │   ├── studio/
│   │   └── pages/
│   └── package.json
│
└── server/
    ├── internal/
    │   ├── config/
    │   ├── handlers/
    │   ├── middleware/
    │   ├── models/
    │   ├── services/
    │   └── webrtc/
    ├── main.go
    └── .env.example
```

## Frontend

The frontend is built with React and Vite. It contains public pages, login/register pages, dashboards, studio pages, wallet pages, and payment result pages.

### Important frontend folders

- `src/app` - main app routes and config
- `src/features/auth` - login, register, auth context, protected routes
- `src/features/admin` - admin dashboard pages
- `src/features/creator` - creator dashboard, events, wallet, subscription
- `src/features/company` - company dashboard and ads pages
- `src/features/public` - home, watch, camera, not found pages
- `src/shared` - reusable components, layout, API files, and helpers
- `src/studio` and `src/pages/studio` - streaming studio related files

### Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Default frontend URL:

```txt
http://localhost:5173
```

### Frontend environment

The frontend uses these values from environment variables. If not provided, it uses local defaults.

```env
VITE_APP_NAME=Vision Cast
VITE_API_URL=http://localhost:8080/api
VITE_WS_URL=ws://localhost:8080/ws
VITE_STREAM_WS_URL=ws://localhost:8080/api/stream/ws
VITE_PUBLIC_UPLOAD_BASE=http://localhost:8080
VITE_ESEWA_SUCCESS_URL=http://localhost:5173/payment/esewa/success
VITE_ESEWA_FAILURE_URL=http://localhost:5173/payment/esewa/failure
```

## Backend

The backend is built with Go. It handles authentication, users, events, ads, wallets, subscriptions, payments, stream destinations, uploads, and WebSocket connections.

### Backend setup

```bash
cd server
cp .env.example .env
```

For Windows PowerShell:

```powershell
cd server
copy .env.example .env
```

After copying the file, update `.env` with your own database and secret values.

Example:

```env
PORT=8080
DB_DSN=host=localhost user=postgres password=your_password dbname=streamangle port=5432 sslmode=disable
JWT_SECRET=replace_with_a_long_random_secret
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
ADMIN_EMAIL=admin@streamangle.com
ADMIN_PASSWORD=change_this_admin_password
WALLET_CURRENCY=NRS
```

Then run:

```bash
go mod tidy
go run .
```

Default backend URL:

```txt
http://localhost:8080
```

## Database

The backend uses PostgreSQL. Before running the backend, create a PostgreSQL database and update `DB_DSN` in the `.env` file.

The backend uses GORM auto migration, so required tables are created when the server starts.

Main tables/models include:

- Users
- Wallets
- Transactions
- Subscriptions
- Events
- Stream Destinations
- Ads
- Ad Placements
- Overlays
- Platform Settings
- Payment Intents

## Default Admin

When the backend starts, it checks if an admin user exists. If no admin is found, it creates one using these `.env` values:

```env
ADMIN_EMAIL=admin@streamangle.com
ADMIN_PASSWORD=change_this_admin_password
```

Change the default admin password before using the project seriously.

## Basic Flow

1. Start PostgreSQL.
2. Start the backend server.
3. Start the frontend app.
4. Login as admin using the admin email and password from `.env`.
5. Register creator and company users.
6. Company creates an ad.
7. Admin approves the ad.
8. Creator creates an event.
9. Creator opens studio and starts streaming.
10.   Public viewers watch the event using the event code.
11.   Creator can play approved ads and receive wallet balance after completion.

## Useful Routes

### Public routes

- `/` - home page
- `/login` - login page
- `/register` - register page
- `/camera` - camera page
- `/watch/:eventCode` - public watch page

### Creator routes

- `/creator/dashboard`
- `/creator/events`
- `/creator/studio/:eventCode`
- `/creator/wallet`
- `/creator/subscription`

### Company routes

- `/company/dashboard`
- `/company/ads`
- `/company/ads/create`
- `/company/wallet`

### Admin routes

- `/admin/dashboard`
- `/admin/users`
- `/admin/ads`
- `/admin/settings`
- `/admin/revenue`
- `/admin/wallet-actions`

## Notes

- Keep `.env` files private.
- PostgreSQL must be running before starting the backend.
- FFmpeg may be needed for streaming related work.
- eSewa pages are included, but real payment verification should be checked properly before using it in production.
- Do not use weak admin passwords in real use.

## Tech Used

### Frontend

- React
- Vite
- React Router
- Axios
- HLS.js
- Tailwind CSS

### Backend

- Go
- Gin
- GORM
- PostgreSQL
- JWT Authentication
- WebSocket
- WebRTC related streaming support

## Team

Project: Vision Cast  
Repository folder: `VishwaQuesters_iicquest4.0`
