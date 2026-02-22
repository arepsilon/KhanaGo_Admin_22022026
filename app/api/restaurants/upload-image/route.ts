import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const restaurantId = formData.get('restaurantId') as string;

        if (!file || !restaurantId) {
            return NextResponse.json({ error: 'File and Restaurant ID are required' }, { status: 400 });
        }

        // Initialize Supabase Admin Client (Service Role)
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        // 1. Ensure Bucket Exists
        const { data: buckets } = await supabaseAdmin.storage.listBuckets();
        const bucketExists = buckets?.some(b => b.name === 'restaurants');

        if (!bucketExists) {
            const { error: createBucketError } = await supabaseAdmin.storage.createBucket('restaurants', {
                public: true,
                fileSizeLimit: 5242880, // 5MB
            });
            if (createBucketError) {
                console.error('Create Bucket Error:', createBucketError);
                // Continue anyway, it might have failed because it exists or other reasons, 
                // but if it truly failed the upload will fail next.
            }
        }

        // 2. Upload File
        const fileExt = file.name.split('.').pop();
        const fileName = `${restaurantId}-${Date.now()}.${fileExt}`;
        const arrayBuffer = await file.arrayBuffer();

        const { error: uploadError } = await supabaseAdmin.storage
            .from('restaurants')
            .upload(fileName, arrayBuffer, {
                contentType: file.type,
                upsert: true
            });

        if (uploadError) {
            console.error('Upload Error:', uploadError);
            return NextResponse.json({ error: 'Failed to upload image: ' + uploadError.message }, { status: 500 });
        }

        // 3. Get Public URL
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('restaurants')
            .getPublicUrl(fileName);

        // 4. Update Restaurant Record
        const { error: updateError } = await supabaseAdmin
            .from('restaurants')
            .update({ image_url: publicUrl })
            .eq('id', restaurantId);

        if (updateError) {
            return NextResponse.json({ error: 'Failed to update database' }, { status: 500 });
        }

        return NextResponse.json({ success: true, url: publicUrl });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
