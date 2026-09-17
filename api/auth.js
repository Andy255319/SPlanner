export default async function handler(req, res) {
    const API_KEY = process.env.FIREBASE_API_KEY;
    const { action, email, password } = req.body;

    if (req.method !== 'POST') return res.status(405).end();

    let url = '';
    if (action === 'SIGNUP') {
        url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
    } else if (action === 'LOGIN') {
        url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        });
        const data = await response.json();
        if (data.error) return res.status(400).json({ error: data.error.message });
        return res.status(200).json({ idToken: data.idToken, localId: data.localId });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
