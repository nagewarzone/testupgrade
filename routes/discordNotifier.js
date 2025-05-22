const fetch = require('node-fetch');  // ต้องติดตั้งด้วย `npm install node-fetch@2`

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1375109993766060163/hiyekifjjMItAEjaVv5xgrOmQg1nyyNdwQ0UJmE2wA_I3qQ6K3abWJcagz5kCiB4bxtw';

async function sendDiscordMessage(content) {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn('Discord webhook URL not configured.');
    return;
  }

  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) {
      console.error('Failed to send Discord message:', res.statusText);
    }
  } catch (error) {
    console.error('Error sending Discord message:', error);
  }
}

module.exports = { sendDiscordMessage };
