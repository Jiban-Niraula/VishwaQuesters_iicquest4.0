# StreamAngle V2 Backend Fixed

This backend is a safer V2 base for StreamAngle.

## What is fixed

- Public admin registration is blocked.
- Admin user is created from `.env` values.
- Real `.env` is not included; use `.env.example`.
- Platform ad pricing is stored in `platform_settings`.
- Company ads use `max_plays` and `remaining_budget` to prevent unlimited creator payouts.
- Creator wallet is credited only after ad placement completion.
- Free creators get reduced payout; the remainder is credited to admin.
- Company wallet deposit is disabled until Khalti/eSewa server verification is implemented.
- Admin manual deposit is available for local testing.
- Destination ownership uses `creator_id`, not the wrong `user_id`.
- RTMP chunks are written only to the selected destination.
- WebSocket camera join checks the creator's camera limit.

## Setup

```powershell
cd server
copy .env.example .env
```

Edit `.env` and set:

```env
DB_DSN=host=localhost user=postgres password=your_password dbname=streamangle port=5432 sslmode=disable
JWT_SECRET=your_long_random_secret
ADMIN_EMAIL=admin@streamangle.com
ADMIN_PASSWORD=your_strong_admin_password
```

Then run:

```powershell
go mod tidy
go fmt ./...
go run .
```

## Important local test flow

1. Start PostgreSQL and create the database.
2. Run the backend.
3. Login as admin from `.env` credentials.
4. Use `POST /api/admin/deposit` to deposit test balance to a company/creator.
5. Company creates/uploads ad with `max_plays`.
6. Admin approves ad.
7. Creator starts ad placement.
8. Creator completes ad placement to receive payout.

## Notes

- Khalti/eSewa is not implemented yet. Do not enable public wallet deposit until server-side verification exists.
- FFmpeg must be installed locally for RTMP streaming.
- Existing old database tables may need a reset if your previous schema conflicts heavily with the new campaign fields.
