# Slopper Bot

Cloudflare Worker that powers the [Slopper](https://github.com/Sloppers/Slopper) GitHub App. Handles `/slopper report` commands globally — when a maintainer reports a user, the bot adds them to the [community risky users list](https://github.com/Sloppers/community-list).

## How it works

1. Maintainer comments `/slopper report` on a PR
2. GitHub sends a webhook to this Worker
3. Worker verifies the reporter has admin/maintain permission
4. Creates `risky_users/{username}` in `Sloppers/community-list`
5. Reacts with a rocket to confirm

## Setup

### 1. Create the GitHub App

In the [Sloppers org settings](https://github.com/organizations/Sloppers/settings/apps/new):

- **Name**: Slopper
- **Webhook URL**: `https://slopper-bot.<your-cf-subdomain>.workers.dev`
- **Webhook secret**: generate a random string
- **Permissions**:
  - Repository: `Contents: Read & Write` (for community-list)
  - Repository: `Pull requests: Read` (to read PR context)
  - Repository: `Members: Read` (to check maintainer status)
  - Organization: `Members: Read`
- **Events**: `Issue comment`

Generate a private key and convert to PKCS#8:

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in downloaded-key.pem -out key-pkcs8.pem
```

### 2. Deploy the Worker

```bash
npm install
npx wrangler deploy
```

### 3. Set secrets

```bash
wrangler secret put APP_ID          # GitHub App ID (numeric)
wrangler secret put PRIVATE_KEY     # Contents of key-pkcs8.pem
wrangler secret put WEBHOOK_SECRET  # Same secret from GitHub App settings
```

### 4. Install the App

Install the Slopper GitHub App on repos that use Slopper. That's it — users don't need to configure anything.

## Development

```bash
npm run dev    # Local dev server with wrangler
```
