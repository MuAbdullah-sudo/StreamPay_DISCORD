import nacl from 'https://esm.sh/tweetnacl@1.0.3';

function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("StreamPay Worker is Alive! 🚀", { status: 200 });
    }

    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");
    const bodyText = await request.text();

    if (!signature || !timestamp) {
      return new Response("Signature missing", { status: 401 });
    }

    // Official Discord Ed25519 Signature Verification
    try {
      const isValid = nacl.sign.detached.verify(
        new TextEncoder().encode(timestamp + bodyText),
        hexToUint8Array(signature),
        hexToUint8Array(env.DISCORD_PUBLIC_KEY)
      );

      if (!isValid) {
        return new Response("Invalid request signature", { status: 401 });
      }
    } catch (e) {
      return new Response("Signature verification failed", { status: 401 });
    }

    const data = JSON.parse(bodyText);

    // 1. Handle Discord PING (Handshake Verification)
    if (data.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Handle Slash Commands (/escrow)
    if (data.type === 2) {
      const commandName = data.data?.name;

      if (commandName === "escrow") {
        const options = data.data?.options || [];
        let amountUsd = 50.0;
        for (const opt of options) {
          if (opt.name === "amount") {
            amountUsd = parseFloat(opt.value);
          }
        }

        const userId = data.member?.user?.id || data.user?.id || "unknown";

        try {
          const user = await getOrCreateUser(env.SUPABASE_URL, env.SUPABASE_KEY, "DISCORD", userId);
          const fee = Math.round(amountUsd * 0.02 * 100) / 100;
          const totalDue = amountUsd + fee;
          const dummyAddress = "0xStreamPay" + crypto.randomUUID().replace(/-/g, "").slice(0, 32);

          const dealData = {
            buyer_id: user.id,
            amount_usd: amountUsd,
            fee_usd: fee,
            currency: "USDT/ETH",
            deposit_address: dummyAddress,
            expected_crypto_amount: totalDue,
            status: "AWAITING_DEPOSIT",
            description: `Discord P2P Escrow by User ID ${userId}`
          };

          const deal = await insertEscrowDeal(env.SUPABASE_URL, env.SUPABASE_KEY, dealData);

          const responseContent = 
            `🛡️ **StreamPay Escrow Initialized!**\n\n` +
            `🆔 **Deal ID:** \`${deal.id}\`\n` +
            `💵 **Trade Amount:** \`${amountUsd}\` USD\n` +
            `⚡ **Platform Fee (2%):** \`${fee}\` USD\n` +
            `💰 **Total Expected:** \`${totalDue}\`\n\n` +
            `📍 **Deposit Address:**\n\`${dummyAddress}\`\n\n` +
            `⏳ Send funds to the address above. Cloudflare edge is listening!`;

          return new Response(JSON.stringify({
            type: 4,
            data: { content: responseContent }
          }), { headers: { "Content-Type": "application/json" } });

        } catch (err) {
          return new Response(JSON.stringify({
            type: 4,
            data: { content: `❌ Error creating escrow deal: ${err.message}` }
          }), { headers: { "Content-Type": "application/json" } });
        }
      }
    }

    return new Response(JSON.stringify({
      type: 4,
      data: { content: "Unknown command!" }
    }), { headers: { "Content-Type": "application/json" } });
  }
};

async function getOrCreateUser(supabaseUrl, supabaseKey, platform, platformUserId) {
  const headers = {
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
    "Content-Type": "application/json"
  };
  const checkRes = await fetch(`${supabaseUrl}/rest/v1/users?platform=eq.${platform}&platform_user_id=eq.${platformUserId}`, { headers });
  const users = await checkRes.json();
  if (users && users.length > 0) return users[0];

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/users`, {
    method: "POST",
    headers: { ...headers, "Prefer": "return=representation" },
    body: JSON.stringify({ platform, platform_user_id: platformUserId })
  });
  const newUsers = await insertRes.json();
  if (newUsers && newUsers.length > 0) return newUsers[0];
  throw new Error("Failed to create user in database");
}

async function insertEscrowDeal(supabaseUrl, supabaseKey, dealData) {
  const headers = {
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  };
  const res = await fetch(`${supabaseUrl}/rest/v1/escrow_deals`, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(dealData)
  });
  const result = await res.json();
  if (res.ok && result.length > 0) return result[0];
  throw new Error(JSON.stringify(result));
}
