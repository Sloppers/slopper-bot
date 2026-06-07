# Slopper Bot

Cloudflare Worker that powers the [Slopper](https://github.com/Sloppers/Slopper) GitHub App. Handles `/slopper report` commands globally — when a maintainer reports a user, the bot adds them to the [community risky users list](https://github.com/Sloppers/community-list).

## How it works

1. Maintainer comments `/slopper report` on a PR
2. GitHub sends a webhook to this Worker
3. Worker verifies the reporter has admin/maintain permission
4. Creates `risky_users/{username}` in `Sloppers/community-list`
5. Reacts with a rocket to confirm
