import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('StreamPay Vercel Bot is Alive! 🚀');
  }

  try {
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    
    const rawBody = await buffer(req);
    const bodyString = rawBody.toString('utf8');

    const isValidRequest = verifyKey(
      bodyString,
      signature,
      timestamp,
      process.env.DISCORD_PUBLIC_KEY
    );

    if (!isValidRequest) {
      return res.status(401).send('Invalid request signature');
    }

    const data = JSON.parse(bodyString);

    // 1. Handle PING (Handshake -> Instant Green Tick!)
    if (data.type === InteractionType.PING) {
      return res.status(200).json({ type: InteractionResponseType.PONG });
    }

    // 2. Handle Slash Commands (/escrow)
    if (data.type === InteractionType.APPLICATION_COMMAND) {
      const commandName = data.data?.name;

      if (commandName === 'escrow') {
        const options = data.data?.options || [];
        let amountUsd = 50.0;
        for (const opt of options) {
          if (opt.name === 'amount') {
            amountUsd = parseFloat(opt.value);
          }
        }

        const userId = data.member?.user?.id || data.user?.id || 'unknown';

        const user = await getOrCreateUser(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, 'DISCORD', userId);
        const fee = Math.round(amountUsd * 0.02 * 100) / 100;
        const totalDue = amountUsd + fee;
        const dummyAddress = '0xStreamPay' + crypto.randomUUID().replace(/-/g, '').slice(0, 32);

        const dealData = {
          buyer_id: user.id,
          amount_usd: amountUsd,
          fee_usd: fee,
          currency: 'USDT/ETH',
          deposit_address: dummyAddress,
          expected_crypto_amount: totalDue,
          status: 'AWAITING_DEPOSIT',
          description: `Discord P2P Escrow by User ID ${userId}`
        };

        const deal = await insertEscrowDeal(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, dealData);

        const responseContent = 
          `🛡️ **StreamPay Escrow Initialized!**\n\n` +
          `🆔 **Deal ID:** \`${deal.id}\`\n` +
          `💵 **Trade Amount:** \`${amountUsd}\` USD\n` +
          `⚡ **Platform Fee (2%):** \`${fee}\` USD\n` +
          `💰 **Total Expected:** \`${totalDue}\`\n\n` +
          `📍 **Deposit Address:**\n\`${dummyAddress}\`\n\n` +
          `⏳ Send funds to the address above. Vercel serverless is listening!`;

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: responseContent }
        });
      }
    }

    return res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'Unknown command!' }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

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
