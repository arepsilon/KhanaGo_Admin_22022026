const https = require('https');

const url = "https://image.pollinations.ai/prompt/burger%20food?width=600&height=400&nologo=true";

console.log("Fetching: " + url);

const req = https.get(url, {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.04.472.124 Safari/537.36"
    }
}, (res) => {
    console.log('statusCode:', res.statusCode);
    // console.log('headers:', res.headers);

    let data = [];
    res.on('data', (chunk) => {
        data.push(chunk);
    });

    res.on('end', () => {
        const buffer = Buffer.concat(data);
        console.log(`Done. Received ${buffer.length} bytes.`);
        console.log(`Content-Type: ${res.headers['content-type']}`);
    });

});

req.on('error', (e) => {
    console.error("Error:", e);
});
