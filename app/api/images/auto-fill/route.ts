import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import sharp from 'sharp';

export async function POST(req: Request) {
    try {
        const { query, itemName, restaurantName } = await req.json();

        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        // 1. Generate Image URL with OpenAI DALL-E 3
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is not configured in environment variables');
        }

        console.log(`Generating image with OpenAI for: ${query}`);

        let openaiResponse;
        let retries = 3;
        let delay = 2000; // 2 seconds initial delay

        while (retries >= 0) {
            openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "dall-e-3",
                    prompt: `Simple, realistic photo of ${query} served on a plain plate in a local Indian restaurant, casual dining style, natural lighting, no fancy garnish`,
                    n: 1,
                    size: "1024x1024",
                    quality: "standard"
                }),
            });

            if (openaiResponse.status === 429 && retries > 0) {
                console.warn(`OpenAI Rate Limit hit. Retrying in ${delay}ms... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                retries--;
                delay *= 2; // Exponential backoff
                continue;
            }
            break;
        }

        if (!openaiResponse!.ok) {
            const errorText = await openaiResponse!.text();
            throw new Error(`OpenAI Error (${openaiResponse!.status}): ${errorText || openaiResponse!.statusText || 'Unknown Error'}`);
        }

        const openaiData = await openaiResponse!.json();
        const dallEUrl = openaiData.data[0].url;

        if (!dallEUrl) {
            throw new Error('OpenAI failed to return an image URL');
        }

        console.log(`Downloading image from OpenAI: ${dallEUrl}`);

        // 2. Download the image
        const imageResponse = await fetch(dallEUrl);

        if (!imageResponse.ok) {
            const errorText = await imageResponse.text();
            throw new Error(`Download Error (${imageResponse.status}): ${errorText || imageResponse.statusText || 'Unknown Error'}`);
        }
        const arrayBuffer = await imageResponse.arrayBuffer();
        let buffer = Buffer.from(arrayBuffer);

        // 3. Compress Image (Strictly < 50KB)
        console.log(`Original buffer size: ${(buffer.length / 1024).toFixed(2)} KB`);
        
        let size = 600;
        let quality = 80;
        let processedBuffer = await sharp(buffer)
            .resize(size, size, { fit: 'inside' })
            .jpeg({ quality })
            .toBuffer();
        
        console.log(`Initial processed size: ${(processedBuffer.length / 1024).toFixed(2)} KB at ${size}px, q=${quality}`);

        // Robust iterative compression
        while (processedBuffer.length > 50 * 1024 && (quality > 10 || size > 200)) {
            if (quality > 20) {
                quality -= 10;
            } else {
                size -= 50;
                quality = 50; // reset quality partially when shrinking
            }
            
            processedBuffer = await sharp(buffer)
                .resize(size, size, { fit: 'inside' })
                .jpeg({ quality })
                .toBuffer();
            
            console.log(`Retrying compression: ${(processedBuffer.length / 1024).toFixed(2)} KB at ${size}px, q=${quality}`);
        }

        console.log(`Final image size: ${(processedBuffer.length / 1024).toFixed(2)} KB`);

        // 4. Upload to Supabase
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
              auth: {
                persistSession: false,
                autoRefreshToken: false,
              }
            }
        );

        const fileName = `menu-items/auto-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        console.log(`Uploading to Supabase bucket 'menu-images' as: ${fileName}`);

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('menu-images')
            .upload(fileName, processedBuffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (uploadError) {
            console.error('Supabase Upload Error:', uploadError);
            throw uploadError;
        }

        console.log('Upload successful:', uploadData);

        // 5. Get Public URL
        const { data: publicUrlData } = supabase.storage
            .from('menu-images')
            .getPublicUrl(fileName);

        return NextResponse.json({ 
            success: true, 
            url: publicUrlData.publicUrl 
        });

    } catch (error: any) {
        console.error('OpenAI Auto-fill error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
