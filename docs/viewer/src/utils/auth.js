// OpenRouter OAuth PKCE Utils

// 1. Generate Code Verifier
export function generateCodeVerifier() {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// 2. Generate Code Challenge (S256)
export async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hash));
    const hashString = String.fromCharCode.apply(null, hashArray);
    return btoa(hashString)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// 3. Initiate Login
export async function initiateLogin() {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    // Store verifier for later
    localStorage.setItem('pkce_verifier', verifier);

    const callbackUrl = window.location.origin; // e.g. http://localhost:5173
    const authUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl)}&code_challenge=${challenge}&code_challenge_method=S256`;

    window.location.href = authUrl;
}

// 4. Exchange Code for Key
export async function exchangeCodeForKey(code) {
    const verifier = localStorage.getItem('pkce_verifier');
    if (!verifier) {
        throw new Error("No PKCE verifier found. Please try logging in again.");
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                code_verifier: verifier,
                code_challenge_method: 'S256',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to exchange code: ${errorText}`);
        }

        const data = await response.json();
        // Clean up
        localStorage.removeItem('pkce_verifier');
        return data.key; // The API Key
    } catch (e) {
        console.error("OAuth Exchange Error:", e);
        throw e;
    }
}
