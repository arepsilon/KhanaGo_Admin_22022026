const https = require('https');

const url = "https://image.pollinations.ai/prompt/burger";

console.log("Fetching: " + url);

const req = https.get(url, {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
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
        console.log(`Body: ${buffer.toString()}`);
    });

});

req.on('error', (e) => {
    console.error("Error:", e);
});
