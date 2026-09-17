export default async function handler(req, res) {
    const API_KEY = process.env.FIREBASE_API_KEY;
    const PROJECT_ID = "aleph-planner-e9cb7";
    const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

    const { action, collection, id, data, uid } = req.body;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split('Bearer ')[1];

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    // 1. 서버단에서 토큰 위조 여부 및 소유자 검증 (T07-C119, T07-C124 방어)
    const verifyRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
    });
    const verifyData = await verifyRes.json();
    if (verifyData.error) return res.status(403).json({ error: 'Invalid Token' }); // 403 거절 발생
    
    const verifiedUid = verifyData.users[0].localId;

    const jsonToFirestore = (obj) => {
        const fields = {};
        for (const key in obj) {
            if (typeof obj[key] === 'string') fields[key] = { stringValue: obj[key] };
            else if (typeof obj[key] === 'number') fields[key] = { doubleValue: obj[key] };
            else if (typeof obj[key] === 'boolean') fields[key] = { booleanValue: obj[key] };
        }
        return { fields };
    };

    const firestoreToJson = (doc) => {
        if (!doc.fields) return {};
        const obj = { id: doc.name.split('/').pop() };
        for (const key in doc.fields) {
            if (doc.fields[key].stringValue !== undefined) obj[key] = doc.fields[key].stringValue;
            else if (doc.fields[key].integerValue !== undefined) obj[key] = parseInt(doc.fields[key].integerValue);
            else if (doc.fields[key].doubleValue !== undefined) obj[key] = parseFloat(doc.fields[key].doubleValue);
            else if (doc.fields[key].booleanValue !== undefined) obj[key] = doc.fields[key].booleanValue;
        }
        return obj;
    };

    try {
        let url, options = { headers: { 'Content-Type': 'application/json' } };
        
        if (action === 'GET_ALL') {
            url = `${BASE_URL}/${collection}?key=${API_KEY}`;
            const response = await fetch(url);
            const result = await response.json();
            let docs = (result.documents || []).map(firestoreToJson);
            // 2. 남의 데이터는 섞이지 않게 내 것만 필터링 (T07-C125)
            docs = docs.filter(doc => doc.owner === verifiedUid);
            return res.status(200).json(docs);
        }
        
        // 3. 수정/삭제 시 내 자료가 맞는지 한번 더 확인 (T07-C121, T07-C120)
        if (action === 'UPDATE' || action === 'DELETE') {
            const checkRes = await fetch(`${BASE_URL}/${collection}/${id}?key=${API_KEY}`);
            const checkData = await checkRes.json();
            const doc = firestoreToJson(checkData);
            if (doc.owner !== verifiedUid) {
                return res.status(403).json({ error: 'Forbidden: Not your data' }); // 403 거절 발생
            }
        }

        if (action === 'ADD') {
            data.owner = verifiedUid; // 강제로 소유자 각인
            url = `${BASE_URL}/${collection}?key=${API_KEY}`;
            options.method = 'POST'; options.body = JSON.stringify(jsonToFirestore(data));
            const response = await fetch(url, options);
            return res.status(200).json(firestoreToJson(await response.json()));
        } else if (action === 'UPDATE') {
            data.owner = verifiedUid;
            url = `${BASE_URL}/${collection}/${id}?key=${API_KEY}`;
            options.method = 'PATCH'; options.body = JSON.stringify(jsonToFirestore(data));
            const response = await fetch(url, options);
            return res.status(200).json(firestoreToJson(await response.json()));
        } else if (action === 'DELETE') {
            url = `${BASE_URL}/${collection}/${id}?key=${API_KEY}`;
            options.method = 'DELETE';
            await fetch(url, options);
            return res.status(200).json({ success: true });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
