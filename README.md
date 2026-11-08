# Streampay-Discord
StreamPay Discord Edition was designed as a lightweight, interactive Discord bot powered by serverless Node.js architecture (Vercel) paired with a Supabase PostgreSQL database. Operating directly inside Discord servers via slash commands (like /escrow), its primary goal was to offer gamer-to-gamer and P2P community members a seamless way to initialize digital trades, generate dynamic deposit addresses, and handle automated escrow flows without leaving their active chat channels. The application relied on Webhook listeners and HTTP signature verification (x-signature-ed25519) to authenticate commands coming from Discord’s gateway, providing quick visual embed cards for deal confirmations.

Why the Project Faced Friction & Was Paused

    Discord 3-Second Execution Timeout: Discord requires an immediate response to slash command webhooks within 3,000 milliseconds. Cold starts on serverless platforms combined with multiple sequential network roundtrips (fetching user data, inserting deals into Supabase, and sending HTTP requests) frequently breached this strict window, triggering constant "application didn't respond in time" errors.

    Environment & Serverless Network Bottlenecks: Hosting external bot logic on free serverless tiers (or free proxies like PythonAnywhere) caused proxy connection drops, HTTPSConnectionPool max-retry failures, and missing environment variable bindings (Error: fetch failed), making asynchronous database calls unreliable.

    High Infrastructure Maintenance vs. Zero Budget: Continuous backend state tracking, edge-case database handling, and real-time polling created heavy backend maintenance overhead—contradicting the goal of building a friction-free, zero-maintenance utility.
