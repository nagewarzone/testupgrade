const express = require('express');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
// const { sendDiscord } = require('./routes/discordNotifier'); // ลบออก
const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
firebaseConfig.private_key = firebaseConfig.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
});
// sendDiscord('📢 ทดสอบการแจ้งเตือน Discord สำเร็จ!'); // ลบออก
const db = admin.firestore();
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'defaultPasswordIfNotSet';

function adminAuth(req, res, next) {
    const adminPass = req.headers['x-admin-password'];
    if (!adminPass || adminPass !== ADMIN_PASSWORD) {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
    }
    next();
}

const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: ADMIN_PASSWORD
};

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'กรุณากรอก username และ password' });
    }
    if (
        username === ADMIN_CREDENTIALS.username &&
        password === ADMIN_CREDENTIALS.password
    ) {
        return res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', token: 'dummy-admin-token' });
    } else {
        return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือไม่ใช่ Admin' });
    }
});

app.post('/proxy', async (req, res) => {
    const { action, username, password, name, pointChange, topgmChange, tokenChange } = req.body;
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
                warshoes: 0,
                warzone: 0,
                bloodshoes: 0,
                point: 0,
                money: 0,
                relevel: 0      
            });
            return res.json({ success: true });
        }

        if (!userDoc.exists) return res.json({ success: false, message: 'ไม่พบผู้ใช้' });
        const userData = userDoc.data();
        if (userData.password !== password) return res.json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });

        if (action === 'login' || action === 'userinfo') {
            return res.json({ success: true, ...userData });
        }
if (action === 'buypemto') {
    const username = req.body.username;
    const userRef = db.collection('users').doc(username);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
        return res.json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
    }

    const userData = userSnap.data();
    const currentPoint = userData.point || 0;
    const currentToken = userData.token || 0;
    const currentBuyCount = userData.buypemtoCount || 0; // ✅ เริ่มจาก 0 ถ้าไม่มี

    if (currentPoint < 200) {
        return res.json({ success: false, message: 'พ้อยท์ไม่เพียงพอ (ต้องมีอย่างน้อย 200)' });
    }

    // ตัดพ้อยท์และเพิ่ม pemto และเพิ่มจำนวนการซื้อ
    await userRef.update({
        point: currentPoint - 200,
        token: currentToken + 1,
        buypemtoCount: currentBuyCount + 1 // ✅ เพิ่ม field นี้ใน user
    });

    // เพิ่ม log ลงใน collection 'logs'
    await db.collection('logs').add({
        Username: username,
        Action: 'Buy Pemto',
        Item: 'pemto',
        PointUsed: 200,
        Result: 'Success',
        Date: admin.firestore.Timestamp.now()
    });

    return res.json({ success: true, message: 'ซื้อ Pemto สำเร็จ! ได้รับ 1 TopGM', newPoint: currentPoint - 200 });
}


       if (action === 'usepoint') {
    const username = req.body.username;
    const userRef = db.collection('users').doc(username);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
        return res.json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
    }

    const userData = userSnap.data();

    const currentPoint = userData.point || 0;
    const currentTopgm = userData.topgm || 0;

    // เช็ค log ล่าสุดของ user สำหรับไอเท็ม topgm ที่ Result === 'แตก'
    const logSnap = await db.collection('logs')
        .where('Username', '==', username)
        .where('Item', '==', 'topgm')
        .where('Result', '==', 'แตก')
        .orderBy('Date', 'desc')
        .limit(1)
        .get();

    if (logSnap.empty) {
        return res.json({ success: false, message: 'ยังไม่มีการแตกของ topgm' });
    }

    const lastBrokenLog = logSnap.docs[0].data();
    const lastBrokenTime = lastBrokenLog.Date; // Firestore Timestamp

    // ตรวจสอบว่าเคยใช้ log นี้แล้วหรือยัง
  if (userData.lastUsedBroken_topgm &&
    userData.lastUsedBroken_topgm.toMillis &&
    userData.lastUsedBroken_topgm.toMillis() === lastBrokenTime.toMillis()) {
    return res.json({ success: false, message: 'คุณได้ดึงจากการแตก topgm ครั้งนี้ไปแล้ว' });
}

    // เปลี่ยนเป็นเช็คว่า point ต้องมีอย่างน้อย 50
    if (currentPoint < 50) {
        return res.json({ success: false, message: 'POINT ไม่เพียงพอ (ต้องมีอย่างน้อย 50)' });
    }

    // หัก 50 point และเพิ่ม topgm 1 พร้อมเก็บ timestamp
  await userRef.update({
    point: currentPoint - 50,
    topgm: currentTopgm + 1,
    lastUsedBroken_topgm: lastBrokenTime
});
    return res.json({ success: true, message: 'ใช้ POINT 50 เพื่อดึง topgm กลับมาแล้ว' });
}
    //ดึง warshoes  
 if (action === 'usepoint1') {
    const username = req.body.username;
    const userRef = db.collection('users').doc(username);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
        return res.json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
    }

    const userData = userSnap.data();

    const currentPoint = userData.point || 0;
    const currentwarshoes = userData.warshoes || 0;

    // เช็ค log ล่าสุดของ user สำหรับไอเท็ม warshoes ที่ Result === 'แตก'
    const logSnap = await db.collection('logs')
        .where('Username', '==', username)
        .where('Item', '==', 'warshoes')
        .where('Result', '==', 'แตก')
        .orderBy('Date', 'desc')
        .limit(1)
        .get();

    if (logSnap.empty) {
        return res.json({ success: false, message: 'ยังไม่มีการแตกของ Warrior Shoes' });
    }

    const lastBrokenLog = logSnap.docs[0].data();
    const lastBrokenTime = lastBrokenLog.Date; // Firestore Timestamp

  // ตรวจสอบว่าเคยใช้ log นี้สำหรับ warshoes แล้วหรือยัง
if (userData.lastUsedBroken_warshoes &&
    userData.lastUsedBroken_warshoes.toMillis &&
    userData.lastUsedBroken_warshoes.toMillis() === lastBrokenTime.toMillis()) {
    return res.json({ success: false, message: 'คุณได้ดึงจากการแตก warshoes ครั้งนี้ไปแล้ว' });
}
    // เปลี่ยนเป็นเช็คว่า point ต้องมีอย่างน้อย 50
    if (currentPoint < 50) {
        return res.json({ success: false, message: 'POINT ไม่เพียงพอ (ต้องมีอย่างน้อย 50)' });
    }

 // หัก 50 point และเพิ่ม warshoes 1 พร้อมเก็บ timestamp แยกของ warshoes
await userRef.update({
    point: currentPoint - 50,
    warshoes: currentwarshoes + 1,
    lastUsedBroken_warshoes: lastBrokenTime
});

    return res.json({ success: true, message: 'ใช้ POINT 50 เพื่อดึง Warrior Shoes กลับมาแล้ว' });
}
 

      if (action === 'upgrade') {
    const itemName = req.body.item || 'warshoes';
    const method = req.body.method || 'money'; // 'money' หรือ 'point'

    let {
        token = 0,
        point = 0,
        money = 0,
        topgm = 0,
        warzone = 0,
        warshoes = 0,
        bloodshoes = 0
    } = userData;

    if (token <= 0) return res.json({ success: false, message: 'คุณไม่มี PEMTO สำหรับอัปเกรด' });

    if ((itemName === 'topgm' && topgm <= 0) || (itemName === 'warshoes' && warshoes <= 0)) {
        return res.json({ success: false, message: 'คุณไม่มีไอเท็มสำหรับอัปเกรด' });
    }

    // ตรวจสอบเงื่อนไขพิเศษของ warshoes
    if (itemName === 'warshoes') {
        if (method === 'money') {
            if (money < 2000) {
                return res.json({ success: false, message: 'คุณมีเงินไม่พอ (ต้องใช้ 2,000M)' });
            }
        } else if (method === 'point') {
            if (point < 50) {
                return res.json({ success: false, message: 'คุณมี Point ไม่พอ (ต้องใช้ 50 Point)' });
            }
        } else {
            return res.json({ success: false, message: 'วิธีการอัปเกรดไม่ถูกต้อง (เลือก money หรือ point)' });
        }
    }

    const rateDoc = await db.collection('upgraderates').doc(itemName).get();
    if (!rateDoc.exists) return res.json({ success: false, message: 'ไม่มีข้อมูลอัตราอัพเกรด' });

    const { successRate, failRate, breakRate } = rateDoc.data();
    if (
        typeof successRate !== 'number' || typeof failRate !== 'number' || typeof breakRate !== 'number' ||
        successRate < 0 || failRate < 0 || breakRate < 0 || successRate + failRate + breakRate > 1
    ) return res.json({ success: false, message: 'ข้อมูลอัตราอัพเกรดไม่ถูกต้อง' });

    const roll = Math.random();
    let logResult, resultMessage;
    token -= 1;

    if (roll < successRate) {
        // สำเร็จ
        if (itemName === 'topgm') {
            topgm -= 1;
            warzone += 1;
            resultMessage = 'อัพเกรดสำเร็จ: Warzone';
        } else if (itemName === 'warshoes') {
            warshoes -= 1;
            bloodshoes += 1;
            resultMessage = 'อัพเกรดสำเร็จ: Bloodshoes';

            if (method === 'money') money -= 2000;
            else if (method === 'point') point -= 50;
        }
        logResult = 'สำเร็จ';
    } else if (roll < successRate + failRate) {
        // ล้มเหลว (ไม่เสียของ)
        logResult = 'ล้มเหลว';
        resultMessage = `อัพเกรดไม่สำเร็จ (${itemName.toUpperCase()} ยังอยู่)`;

        if (itemName === 'warshoes') {
            if (method === 'money') money -= 2000;
            else if (method === 'point') point -= 50;
        }
    } else {
        // แตก (ของหาย)
        if (itemName === 'topgm') {
            topgm -= 1;
            resultMessage = 'อัพเกรดล้มเหลว ไอเท็มสูญหาย (TOPGM หาย)';
        } else if (itemName === 'warshoes') {
            warshoes -= 1;
            resultMessage = 'อัพเกรดล้มเหลว ไอเท็มสูญหาย (warshoes หาย)';

            if (method === 'money') money -= 2000;
            else if (method === 'point') point -= 50;
        }
        logResult = 'แตก';
    }



    // ป้องกันค่าติดลบ
    if (topgm < 0) topgm = 0;
    if (warshoes < 0) warshoes = 0;
    if (money < 0) money = 0;
    if (point < 0) point = 0;

    await userRef.update({ token, topgm, warzone, warshoes, bloodshoes, money, point });

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

// --------------------- Public & Admin APIs ---------------------

app.get('/admin/getUpgradeRates', async (req, res) => {
    try {
        const snapshot = await db.collection('upgraderates').get();
        const rates = {};
        snapshot.forEach(doc => rates[doc.id] = doc.data());
        res.json({ success: true, rates });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server Error' });
    }
});

app.get('/admin/getLogs', async (req, res) => {
  try {
    const search = (req.query.search || '').toLowerCase();
    const limit = parseInt(req.query.limit) || 100;

    const snapshot = await db.collection('logs').orderBy('Date', 'desc').limit(limit).get();
    const logs = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const log = {
        id: doc.id,
        date: (data.Date instanceof admin.firestore.Timestamp)
          ? data.Date.toDate().toISOString()
          : data.Date || '',
        item: data.Item || '',
        name: data.Name || '',
        result: data.Result || '',
        username: data.Username || ''
      };

      if (!search ||
          log.item.toLowerCase().includes(search) ||
          log.name.toLowerCase().includes(search) ||
          log.result.toLowerCase().includes(search) ||
          log.username.toLowerCase().includes(search)) {
        logs.push(log);
      }
    });

    res.json({ success: true, logs });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server Error' });
  }
});

app.get('/admin/getUsers', adminAuth, async (req, res) => {
  try {
    const search = (req.query.search || '').toLowerCase();

    let usersQuery = db.collection('users').orderBy('__name__').limit(100);

    const usersSnapshot = await usersQuery.get();
    const users = [];

    usersSnapshot.forEach(doc => {
      const username = doc.id.toLowerCase();
      if (!search || username.includes(search)) {
        users.push({ username: doc.id, ...doc.data() });
      }
    });

    res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server Error' });
  }
});
app.post('/admin/deleteLogs', adminAuth, async (req, res) => {
  try {
    const { logIds } = req.body;

    if (!Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({ success: false, message: 'ต้องส่ง logIds เป็น array และไม่ว่าง' });
    }

    const batch = db.batch();
    const logsCollection = db.collection('logs');

    logIds.forEach(id => {
      const docRef = logsCollection.doc(id);
      batch.delete(docRef);
    });

    await batch.commit();

    res.json({ success: true, message: `${logIds.length} logs ถูกลบเรียบร้อย` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบ logs' });
  }
});


app.post('/admin/updateUpgradeRate', adminAuth, async (req, res) => {
    try {
        const { itemName, successRate, failRate, breakRate } = req.body;
        if (!itemName) return res.json({ success: false, message: 'Missing itemName' });

        if (
            typeof successRate !== 'number' || typeof failRate !== 'number' || typeof breakRate !== 'number' ||
            successRate < 0 || failRate < 0 || breakRate < 0 || successRate + failRate + breakRate > 1
        ) return res.json({ success: false, message: 'ข้อมูลอัตราอัพเกรดไม่ถูกต้อง' });

        await db.collection('upgraderates').doc(itemName).set({
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

app.post('/admin/updateUser', adminAuth, async (req, res) => {
    try {
        const { username, fields } = req.body;
        if (!username || typeof fields !== 'object') {
            return res.json({ success: false, message: 'Invalid request body' });
        }

        const userRef = db.collection('users').doc(username);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return res.json({ success: false, message: 'User not found' });

        await userRef.update(fields);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server Error' });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
