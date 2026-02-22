const https = require('https');

const apiKey = "sk_kmu8wUCuaUFEsTkhjFs17co2z8JjyywR"; // Hardcoded from .env.local view
const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const query = "Burger";
const encodedQuery = encodeURIComponent(`${query} food delicious photography high quality`);
// simplified URL from recent changes
const url = `https://image.pollinations.ai/prompt/${encodedQuery}`;

console.log("Fetching: " + url);

const req = https.get(url, {
    headers: {
        "User-Agent": ua,
        "Authorization": `Bearer ${apiKey}`
    }
}, (res) => {
    console.log('statusCode:', res.statusCode);

    let data = [];
    res.on('data', (chunk) => {
        data.push(chunk);
    });

    res.on('end', () => {
        const buffer = Buffer.concat(data);
        console.log(`Received ${buffer.length} bytes.`);
        if (res.statusCode !== 200) {
            console.log(`Body: ${buffer.toString()}`);
        } else {
            console.log("Success! Image received.");
        }
    });

});

req.on('error', (e) => {
    console.error("Error:", e);
});
