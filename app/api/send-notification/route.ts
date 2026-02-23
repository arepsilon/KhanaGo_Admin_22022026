import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { notifications } = await req.json();

        if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
            return NextResponse.json({ error: 'No notifications provided' }, { status: 400 });
        }

        // Send in batches of 100 (Expo Push limit)
        const results = [];
        for (let i = 0; i < notifications.length; i += 100) {
            const batch = notifications.slice(i, i + 100);
            const response = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(batch),
            });
            const result = await response.json();
            results.push(result);
        }

        return NextResponse.json({ success: true, results, count: notifications.length });
    } catch (error: any) {
        console.error('Push notification error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
