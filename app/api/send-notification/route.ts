import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
    try {
        const { targetUserIds, titleTemplate, bodyTemplate, ruleId } = await req.json();

        if (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
            return NextResponse.json({ error: 'No target users provided' }, { status: 400 });
        }

        // Initialize Supabase with Service Role Key to bypass RLS on push_tokens table
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json({ error: 'Server misconfiguration: Missing Supabase Admin credentials' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Fetch tokens (bypassing the "Admins can read all tokens" RLS block)
        const tokens = [];
        const chunkSize = 50;
        for (let i = 0; i < targetUserIds.length; i += chunkSize) {
            const chunk = targetUserIds.slice(i, i + chunkSize);
            const { data, error: tokenError } = await supabase
                .from('push_tokens')
                .select('user_id, token')
                .eq('app_type', 'customer')
                .in('user_id', chunk)
                .order('updated_at', { ascending: false });

            if (tokenError) {
                console.error("Supabase tokens query error:", tokenError);
                return NextResponse.json({ error: `Supabase query error: ${tokenError.message || JSON.stringify(tokenError)}` }, { status: 500 });
            }
            if (data) {
                tokens.push(...data);
            }
        }

        if (!tokens || tokens.length === 0) {
            return NextResponse.json({ error: 'No active push tokens found for targeted users' }, { status: 404 });
        }

        // Keep only the latest token per user to prevent duplicate notifications
        const latestTokenPerUser = [];
        const seenUsers = new Set<string>();
        for (const t of tokens) {
            if (!seenUsers.has(t.user_id)) {
                seenUsers.add(t.user_id);
                latestTokenPerUser.push(t);
            }
        }

        // Fetch profiles to get full names for template personalization
        const userIdsForNames = latestTokenPerUser.map(t => t.user_id);
        const userProfiles = [];
        for (let i = 0; i < userIdsForNames.length; i += chunkSize) {
            const chunk = userIdsForNames.slice(i, i + chunkSize);
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name')
                .in('id', chunk);
            if (data) {
                userProfiles.push(...data);
            }
        }
            
        const nameMap = new Map(userProfiles.map(p => [p.id, p.full_name || 'there']));

        // Build notifications with {name} replaced
        const notifications = latestTokenPerUser.map(t => {
            const userName = nameMap.get(t.user_id) || 'there';
            return {
                to: t.token,
                title: titleTemplate.replace(/{name}/gi, userName),
                body: bodyTemplate.replace(/{name}/gi, userName),
                sound: 'default',
                data: { type: 'marketing', rule_id: ruleId },
            };
        });

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

        return NextResponse.json({ 
            success: true, 
            results, 
            count: notifications.length,
            sentUserIds: userIdsForNames
        });
        
    } catch (error: any) {
        console.error('Push notification error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
