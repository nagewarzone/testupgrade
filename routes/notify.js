const express = require('express');
const axios = require('axios');
const router = express.Router();

const DISCORD_WEBHOOK_URL = 'ใส่ Discord webhook URL ของคุณที่นี่';

async function sendDiscordNotification(message) {
  try {
    await axios.post(DISCORD_WEBHOOK_URL, { content: message });
  } catch (error) {
    console.error('Failed to send Discord notification:', error);
  }
}

router.post('/notify-discord', async (req, res) => {
  const { playerName, itemName, result } = req.body;

  let message;
  if (result === 'success') {
    message = `🎉 [อัพเกรดสำเร็จ] ผู้เล่น: ${playerName}, ไอเท็ม: ${itemName}`;
  } else if (result === 'lost') {
    message = `💀 [ของแตก สูญหาย] ผู้เล่น: ${playerName}, ไอเท็ม: ${itemName}`;
  } else if (result === 'fail') {
    message = `❌ [อัพเกรดล้มเหลว] ผู้เล่น: ${playerName}, ไอเท็ม: ${itemName}`;
  } else {
    message = `ℹ️ [ผลลัพธ์ไม่ระบุ] ผู้เล่น: ${playerName}, ไอเท็ม: ${itemName}, ผลลัพธ์: ${result}`;
  }

  await sendDiscordNotification(message);

  res.json({ status: 'ok', messageSent: message });
});

module.exports = router;
