const https = require('https');

const apiKey = "sk_kmu8wUCuaUFEsTkhjFs17co2z8JjyywR";
const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function fetchUrl(prompt) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
    return new Promise((resolve) => {
        console.log(`Testing prompt: "${prompt}"`);
        const req = https.get(url, {
            headers: {
                "User-Agent": ua,
                "Authorization": `Bearer ${apiKey}`
            }
        }, (res) => {
            console.log(`--> Status: ${res.statusCode}`);
            resolve();
        });
        req.on('error', e => {
            console.error("Error:", e);
            resolve();
        });
    });
}

async function run() {
    await fetchUrl("Burger food");
    await fetchUrl("Burger food delicious");
    await fetchUrl("Burger food delicious photography");
    await fetchUrl("Burger food delicious photography high quality"); // The offending one
}

run();
