const fetch = require('node-fetch');  // ต้องติดตั้งด้วย `npm install node-fetch@2`

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1375138470422384650/P_AsrLHzoCMPplokk7XLWEU6ej0fRWlbppOeh9ZbmYzlcQiU6_oMPTFodtLoahxZZEJZ';

// ฟังก์ชัน delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendDiscord(content) {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn('Discord webhook URL not configured.');
    return;
  }

  // หน่วงเวลาก่อนส่ง (500ms)
  await delay(500);

  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    if (res.status === 429) {
      const data = await res.json();
      const retryAfter = data.retry_after || 1000;
      console.warn(`Rate limited. Retrying after ${retryAfter}ms`);
      await delay(retryAfter);
      return sendDiscord(content); // ส่งใหม่หลังรอ
    }

    if (!res.ok) {
      console.error('Failed to send Discord message:', res.statusText);
    }
  } catch (error) {
    console.error('Error sending Discord message:', error);
  }
}

module.exports = { sendDiscord };
