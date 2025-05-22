const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const admin = require('firebase-admin');

const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
firebaseConfig.private_key = firebaseConfig.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
});

const db = admin.firestore();
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const fetch = require('node-fetch'); // ต้องติดตั้ง node-fetch

const webhookURL = process.env.DISCORD_WEBHOOK_URL;
async function sendDiscord(message, embed = null) {
    try {
        const body = embed ? { embeds: [embed] } : { content: message };
        const res = await fetch(webhookURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const text = await res.text();
            console.error('ส่งข้อความ Discord ล้มเหลว:', res.status, text);
        } else {
            console.log('ส่งข้อความ Discord สำเร็จ');
        }
    } catch (error) {
        console.error('ส่งข้อความ Discord ล้มเหลว:', error);
    }
}


const ADMIN_PASSWORD = '7890';
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

        if (action === 'usepoint') {
            if (typeof pointChange !== 'number' || typeof topgmChange !== 'number') {
                return res.json({ success: false, message: 'Invalid pointChange or topgmChange' });
            }

            const displayName = name || username;
            const newPoint = (userData.point || 0) + pointChange;
            const newTopgm = (userData.topgm || 0) + topgmChange;

            if (newPoint < 0) return res.json({ success: false, message: 'POINT ไม่พอ' });
            if (newTopgm < 0) return res.json({ success: false, message: 'ไม่สามารถลบ topgm ได้มากกว่าที่มี' });

            await userRef.update({ point: newPoint, topgm: newTopgm });

            await sendDiscord(`${displayName} แลก ${Math.abs(pointChange)} พ้อยท์ ได้รับไอเท็ม TOPGM จำนวน ${Math.abs(topgmChange)} ชิ้น`);
            return res.json({ success: true });
        }

        if (action === 'upgrade') {
            const itemName = 'topgm';
            let { token = 0, topgm = 0, warzone = 0 } = userData;

            if (token <= 0) return res.json({ success: false, message: 'คุณไม่มี PEMTO สำหรับอัปเกรด' });
            if (topgm <= 0) return res.json({ success: false, message: 'คุณไม่มีไอเท็มสำหรับอัพเกรด' });

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
                topgm -= 1;
                warzone += 1;
                logResult = 'สำเร็จ';
                resultMessage = 'อัพเกรดสำเร็จ: Warzone';

                const embed = {
                    title: `🎉 ${(name || username)} ได้อัพเกรดสำเร็จ!`,
                    description: `ไอเท็มมีระดับสูงขึ้นเป็น "Warzone S.GOD+7"!!`,
                    color: 0x00FF00,
                    image: {
                        url: "https://img5.pic.in.th/file/secure-sv1/image_2025-05-21_025140493-removebg-preview.png"
                    },
                    footer: {
                        text: "ได้รับไอเท็ม Warzone S.GOD+7"
                    },
                    timestamp: new Date().toISOString()
                };
                await sendDiscord(null, embed);
            } else if (roll < successRate + failRate) {
                logResult = 'ล้มเหลว';
                resultMessage = 'อัพเกรดไม่สำเร็จ (TOPGM ยังอยู่)';
                await sendDiscord(`⚠️ ${(name || username)} ได้อัพเกรดปลอก TOPGM ล้มเหลว! ขอให้โชคดีครั้งหน้า`);
            } else {
                topgm -= 1;
                logResult = 'แตก';
                resultMessage = 'อัพเกรดล้มเหลว ไอเท็มสูญหาย (TOPGM หาย)';
                await sendDiscord(`💥 ${(name || username)} ได้อัพเกรดล้มเหลว! ไอเท็มปลอก TOPGM ถูกทำลาย`);
            }

            if (topgm < 0) topgm = 0;

            await userRef.update({ token, topgm, warzone });

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

app.get('/getUpgradeRates', async (req, res) => {
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

app.get('/getLogs', async (req, res) => {
    try {
        const snapshot = await db.collection('logs').orderBy('Date', 'desc').limit(100).get();
        const logs = [];
        snapshot.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
        res.json({ success: true, logs });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server Error' });
    }
});

app.get('/admin/getUsers', adminAuth, async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const users = [];
        usersSnapshot.forEach(doc => users.push({ username: doc.id, ...doc.data() }));
        res.json({ success: true, users });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server Error' });
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
