const dotenv = require('dotenv');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Load .env.local
dotenv.config({ path: path.join(__dirname, '.env.local') });

async function testOpenAI() {
    const query = "Delicious pepperoni pizza with melted cheese, professional food photography";
    console.log(`Testing OpenAI DALL-E with prompt: "${query}"`);

    if (!process.env.OPENAI_API_KEY) {
        console.error("Error: OPENAI_API_KEY is not set in .env.local");
        process.exit(1);
    }

    try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: query,
                n: 1,
                size: "1024x1024"
            }),
        });

        const data = await response.json();
        if (response.ok) {
            console.log("Success! Image URL:", data.data[0].url);
        } else {
            console.error("OpenAI Error:", JSON.stringify(data.error, null, 2));
        }
    } catch (error) {
        console.error("Fetch Error:", error);
    }
}

testOpenAI();
