const https = require('https');

const apiKey = "sk_kmu8wUCuaUFEsTkhjFs17co2z8JjyywR";
const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function fetchUrl(url, headers) {
    return new Promise((resolve) => {
        console.log("Fetching: " + url + " | Headers: " + JSON.stringify(headers));
        const req = https.get(url, { headers }, (res) => {
            let data = [];
            res.on('data', c => data.push(c));
            res.on('end', () => {
                const buffer = Buffer.concat(data);
                console.log(`Status: ${res.statusCode} | Size: ${buffer.length}`);
                if (res.statusCode !== 200) console.log(`Body: ${buffer.toString().substring(0, 50)}...`);
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
    // Test 1: Bearer Header (Again, explicit)
    await fetchUrl("https://image.pollinations.ai/prompt/Burger", {
        "User-Agent": ua,
        "Authorization": `Bearer ${apiKey}`
    });

    // Test 2: Token in Query
    await fetchUrl(`https://image.pollinations.ai/prompt/Burger?token=${apiKey}`, {
        "User-Agent": ua
    });

    // Test 3: No Auth (Just to see if key makes it WORSE)
    await fetchUrl("https://image.pollinations.ai/prompt/Burger", {
        "User-Agent": ua
    });
}

run();
