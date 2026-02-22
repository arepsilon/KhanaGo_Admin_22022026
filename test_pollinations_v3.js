const https = require('https');

const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        console.log("Fetching: " + url);
        const req = https.get(url, {
            headers: { "User-Agent": ua }
        }, (res) => {
            let data = [];
            res.on('data', c => data.push(c));
            res.on('end', () => {
                const buffer = Buffer.concat(data);
                console.log(`Status: ${res.statusCode} | Size: ${buffer.length}`);
                if (res.statusCode !== 200) console.log(`Body: ${buffer.toString().substring(0, 100)}...`);
                resolve();
            });
        });
        req.on('error', e => {
            console.error("Error:", e);
            resolve();
        });
    });
}

async function run() {
    console.log("--- Test 1: Simple ---");
    await fetchUrl("https://image.pollinations.ai/prompt/Burger");

    console.log("\n--- Test 2: With Params ---");
    await fetchUrl("https://image.pollinations.ai/prompt/Burger?width=600&height=400&nologo=true");

    console.log("\n--- Test 3: Complex Prompt + Params ---");
    const prompt = encodeURIComponent("Burger food delicious photography high quality");
    await fetchUrl(`https://image.pollinations.ai/prompt/${prompt}?width=600&height=400&nologo=true`);
}

run();
