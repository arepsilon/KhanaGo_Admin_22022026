import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PHONEPE_UAT_URL = 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay';
const PHONEPE_PROD_URL = 'https://api.phonepe.com/apis/hermes/pg/v1/pay';
const PHONEPE_ENDPOINT = '/pg/v1/pay';

export async function POST(request: NextRequest) {
    try {
        const { orderId, amount, customerId, customerPhone, cityId } = await request.json();

        if (!orderId || !amount || !customerId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Fetch PhonePe credentials from app_settings
        let query = supabase.from('app_settings').select('key, value');
        if (cityId) {
            query = query.eq('city_id', cityId);
        } else {
            query = query.is('city_id', null);
        }

        const { data: settings, error: settingsError } = await query.in('key', [
            'phonepe_merchant_id',
            'phonepe_salt_key',
            'phonepe_salt_index',
            'phonepe_environment',
        ]);

        if (settingsError) throw settingsError;

        const merchantId = settings?.find(s => s.key === 'phonepe_merchant_id')?.value?.toString().replace(/"/g, '');
        const saltKey = settings?.find(s => s.key === 'phonepe_salt_key')?.value?.toString().replace(/"/g, '');
        const saltIndex = settings?.find(s => s.key === 'phonepe_salt_index')?.value?.toString().replace(/"/g, '') || '1';
        const environment = settings?.find(s => s.key === 'phonepe_environment')?.value?.toString().replace(/"/g, '') || 'UAT';

        if (!merchantId || !saltKey) {
            return NextResponse.json({ error: 'PhonePe credentials not configured' }, { status: 500 });
        }

        const merchantTransactionId = `KG_${orderId.replace(/-/g, '').substring(0, 30)}`;

        const payload = {
            merchantId,
            merchantTransactionId,
            merchantUserId: customerId,
            amount: Math.round(amount * 100), // paise
            redirectUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/phonepe-callback`,
            redirectMode: 'POST',
            callbackUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/phonepe-callback`,
            mobileNumber: customerPhone || '',
            paymentInstrument: { type: 'PAY_PAGE' },
        };

        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
        const checksumInput = base64Payload + PHONEPE_ENDPOINT + saltKey;
        const sha256Hash = crypto.createHash('sha256').update(checksumInput).digest('hex');
        const checksum = `${sha256Hash}###${saltIndex}`;

        const phonePeUrl = environment === 'PRODUCTION' ? PHONEPE_PROD_URL : PHONEPE_UAT_URL;

        const response = await fetch(phonePeUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': checksum,
                accept: 'application/json',
            },
            body: JSON.stringify({ request: base64Payload }),
        });

        const result = await response.json();

        if (!result.success) {
            console.error('PhonePe initiation failed:', result);
            return NextResponse.json({ error: result.message || 'Payment initiation failed' }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            merchantTransactionId,
            instrumentResponse: result.data?.instrumentResponse,
        });

    } catch (error: any) {
        console.error('PhonePe API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
