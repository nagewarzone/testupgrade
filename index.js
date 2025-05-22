const express = require('express');  
const cors = require('cors');

const path = require('path');

const admin = require('firebase-admin');

const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);

// แปลง \n ใน private_key เป็น new line จริง
firebaseConfig.private_key = firebaseConfig.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
});

const db = admin.firestore();
const app = express();
const port = 3000;
const axios = require('axios');

async function sendDiscord(content, embed = null) {
  const payload = {
    content: content || undefined,
    embeds: embed ? [embed] : undefined
  };

  try {
    await axios.post('https://discord.com/api/webhooks/1375066650495422464/ZLtLH6rKZtTwFje13E7BVl0-OT-jRJvlYj0uE0_Cw7uRN2YR6oJz1ZKfD2pmmZEVWI9Q', payload);
  } catch (err) {
    console.error('ไม่สามารถส่ง Discord ได้:', err);
  }
}

app.use(cors());
// ใช้ express built-in json parser แทน body-parser
app.use(express.json());

// เสิร์ฟ static HTML, CSS, JS จากโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));

// กำหนดรหัสผ่าน admin ไว้ที่นี่ (เปลี่ยนเป็นรหัสที่ปลอดภัยจริง)
const ADMIN_PASSWORD = '7890';

// Middleware สำหรับตรวจสอบ admin ผ่าน header 'x-admin-password'
function adminAuth(req, res, next) {
  const adminPass = req.headers['x-admin-password'];
  if (!adminPass || adminPass !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }
  next();
}

// **เพิ่มข้อมูล username + password ของ admin สำหรับ login แบบ POST**
const ADMIN_CREDENTIALS = {
  username: 'admin', // เปลี่ยนชื่อผู้ใช้ admin ตามต้องการ
  password: ADMIN_PASSWORD // ใช้รหัสผ่านเดียวกับ ADMIN_PASSWORD หรือเปลี่ยนได้
};

// เพิ่ม API สำหรับ login admin โดยเช็ค username + password จาก body
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอก username และ password' });
  }

  if (
    username === ADMIN_CREDENTIALS.username &&
    password === ADMIN_CREDENTIALS.password
  ) {
    // อาจจะส่ง token หรือ session ไว้ใช้ในอนาคต
    return res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', token: 'dummy-admin-token' });
  } else {
    return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือไม่ใช่ Admin' });
  }
});

// --- API สำหรับผู้ใช้ทั่วไป ลงทะเบียน / เข้าสู่ระบบ / ใช้พ้อยท์ / อัปเกรด ---
app.post('/proxy', async (req, res) => {
  const { action, username, password, name, pointChange, topgmChange } = req.body;

  if (!action) return res.json({ success: false, message: 'Missing action' });

  try {
    const userRef = db.collection('users').doc(username);
    const userDoc = await userRef.get();

    if (action === 'register') {
      if (!username || !password) return res.json({ success: false, message: 'Missing username or password' });

      if (userDoc.exists) return res.json({ success: false, message: 'Username ซ้ำ' });

      await userRef.set({
        password,
        token: 0,
        topgm: 0,
        warzone: 0,
        point: 0
      });
      return res.json({ success: true });
    }

    if (!userDoc.exists) return res.json({ success: false, message: 'ไม่พบผู้ใช้' });
    const userData = userDoc.data();
    if (userData.password !== password) return res.json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });

    if (action === 'login' || action === 'userinfo') {
      return res.json({ success: true, ...userData });
    }

    // ใช้พ้อยท์แลก topgm
    if (action === 'usepoint') {
      if (typeof pointChange !== 'number' || typeof topgmChange !== 'number') {
        return res.json({ success: false, message: 'Invalid pointChange or topgmChange' });
      }

      const currentPoint = userData.point || 0;
      const currentTopgm = userData.topgm || 0;

      const newPoint = currentPoint + pointChange;
      const newTopgm = currentTopgm + topgmChange;

      if (newPoint < 0) {
        return res.json({ success: false, message: 'POINT ไม่พอ' });
      }

      if (newTopgm < 0) {
        return res.json({ success: false, message: 'ไม่สามารถลบ topgm ได้มากกว่าที่มี' });
      }

      await userRef.update({ point: newPoint, topgm: newTopgm });

      return res.json({ success: true });
    }

    // อัปเกรดไอเท็ม topgm เป็น warzone
    if (action === 'upgrade') {
      const itemName = 'topgm';
      const hasItem = userData[itemName] || 0;
      let currentToken = userData.token || 0;
      let warzone = userData.warzone || 0;
      let topgm = hasItem;

      if (currentToken <= 0) {
        return res.json({ success: false, message: 'คุณไม่มี PEMTO สำหรับอัปเกรด' });
      }
      if (topgm <= 0) {
        return res.json({ success: false, message: 'คุณไม่มีไอเท็มสำหรับอัพเกรด' });
      }

      const rateDoc = await db.collection('upgraderates').doc(itemName).get();
      if (!rateDoc.exists) return res.json({ success: false, message: 'ไม่มีข้อมูลอัตราอัพเกรด' });

      const { successRate, failRate, breakRate } = rateDoc.data();
      if (
        typeof successRate !== 'number' || typeof failRate !== 'number' || typeof breakRate !== 'number' ||
        successRate < 0 || failRate < 0 || breakRate < 0 ||
        successRate + failRate + breakRate > 1
      ) {
        return res.json({ success: false, message: 'ข้อมูลอัตราอัพเกรดไม่ถูกต้อง' });
      }

      const roll = Math.random();
      let result = '';
      let logResult = '';
      let resultMessage = '';

      currentToken -= 1;

      if (roll < successRate) {
  result = 'success';
  topgm -= 1;
  warzone += 1;
  logResult = `สำเร็จ`;
  resultMessage = `อัพเกรดสำเร็จ: Warzone`;

  const embed = {
    title: `🎉 ${name || username} ได้อัพเกรดสำเร็จ!`,
    description: `ไอเท็มมีระดับสูงขึ้นเป็น **"Warzone S.GOD+7"** 🚀`,
    color: 0x00FF00, // เขียว
    image: {
      url: "https://img5.pic.in.th/file/secure-sv1/image_2025-05-21_025140493-removebg-preview.png"
    },
    footer: { text: "ได้รับไอเท็ม Warzone S.GOD+7" },
    timestamp: new Date().toISOString()
  };

  await sendDiscord(null, embed);

} else if (roll < successRate + failRate) {
  result = 'fail';
  logResult = `ล้มเหลว`;
  resultMessage = `อัพเกรดไม่สำเร็จ (TOPGM ยังอยู่)`;

  const embed = {
    title: `⚠️ ${name || username} อัพเกรดล้มเหลว`,
    description: `การอัพเกรด **TOPGM** ไม่สำเร็จ\nแต่ไอเท็มยังปลอดภัยอยู่`,
    color: 0xFFFF00, // เหลือง
    footer: { text: "ยังคงมีไอเท็ม TOPGM" },
    timestamp: new Date().toISOString()
  };

  await sendDiscord(null, embed);

} else {
  result = 'broken';
  topgm -= 1;
  logResult = `แตก`;
  resultMessage = `อัพเกรดล้มเหลว ไอเท็มสูญหาย (TOPGM หาย)`;

  const embed = {
    title: `💥 ${name || username} อัพเกรดล้มเหลว! ไอเท็มแตก`,
    description: `การอัพเกรด **TOPGM** ล้มเหลวอย่างรุนแรง\n💀 ไอเท็มสูญหายถาวร`,
    color: 0xFF0000, // แดง
    footer: { text: "ไอเท็ม TOPGM ถูกทำลาย" },
    timestamp: new Date().toISOString()
  };

  await sendDiscord(null, embed);
}


      if (topgm < 0) topgm = 0;

      await userRef.update({
        token: currentToken,
        warzone: warzone,
        topgm: topgm
      });

      await db.collection('logs').add({
        Date: admin.firestore.FieldValue.serverTimestamp(),
        Username: username,
        Name: name || '',
        Item: itemName,
        Result: logResult
      });

      return res.json({ success: true, result: logResult, resultMessage });
    }

    return res.json({ success: false, message: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: 'Server Error' });
  }
});

// API ดึงอัตราอัปเกรดทั้งหมด (public)
app.get('/getUpgradeRates', async (req, res) => {
  try {
    const snapshot = await db.collection('upgraderates').get();
    const rates = {};
    snapshot.forEach(doc => {
      rates[doc.id] = doc.data();
    });
    res.json({ success: true, rates });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server Error' });
  }
});

// API ดึง logs ล่าสุด 100 รายการ (public หรือ admin ก็ได้)
// API สำหรับ admin ดึงรายชื่อผู้ใช้ทั้งหมด
app.get('/admin/getUsers', adminAuth, async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = [];
    usersSnapshot.forEach(doc => {
      users.push({ username: doc.id, ...doc.data() });
    });
    res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server Error' });
  }
});

app.get('/getLogs', async (req, res) => {
  try {
    const snapshot = await db.collection('logs').orderBy('Date', 'desc').limit(100).get();
    const logs = [];
    snapshot.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    res.json({ success: true, logs });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server Error' });
  }
});

// --- API สำหรับ admin ---

// แก้ไขอัตราอัปเกรด (ต้องส่ง header 'x-admin-password')
app.post('/admin/updateUpgradeRate', adminAuth, async (req, res) => {
  try {
    const { itemName, successRate, failRate, breakRate } = req.body;
    if (!itemName) return res.json({ success: false, message: 'Missing itemName' });

    // ตรวจสอบข้อมูล rate เป็นตัวเลขและผลรวมไม่เกิน 1
    if (
      typeof successRate !== 'number' || typeof failRate !== 'number' || typeof breakRate !== 'number' ||
      successRate < 0 || failRate < 0 || breakRate < 0 ||
      successRate + failRate + breakRate > 1
    ) {
      return res.json({ success: false, message: 'ข้อมูลอัตราอัปเกรดไม่ถูกต้อง' });
    }

    // อัปเดตหรือสร้างเอกสารอัตราอัปเกรด
    const rateRef = db.collection('upgraderates').doc(itemName);
    await rateRef.set({
      successRate,
      failRate,
      breakRate,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server Error' });
  }
});

// แก้ไขข้อมูลผู้ใช้ เช่น token, point, topgm (ต้องส่ง header 'x-admin-password')
app.post('/admin/updateUser', adminAuth, async (req, res) => {
  try {
    const { username, fields } = req.body;
    if (!username || typeof fields !== 'object') {
      return res.json({ success: false, message: 'Invalid request body' });
    }

    const userRef = db.collection('users').doc(username);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.json({ success: false, message: 'User not found' });

    // อัปเดตข้อมูลผู้ใช้ตาม fields ที่ส่งมา
    await userRef.update(fields);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server Error' });
  }
});


app.listen(port, () => {
  console.log(`🔥 Server is running at http://localhost:${port}`);
});
