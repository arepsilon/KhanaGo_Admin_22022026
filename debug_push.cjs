const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = 'd:/GitHub/KG_OneMoreTry/admin-dashboard/.env.local';
const envFile = fs.readFileSync(envPath, 'utf8');

let url = '';
let key = '';

envFile.split('\n').forEach(line => {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
});

const supabase = createClient(url, key);

async function checkTokens() {
    const userId = 'a74cd01b-623d-454d-9d2f-e834d8116611';

    console.log('Fetching push tokens for:', userId);
    const { data: tokens, error } = await supabase
        .from('push_tokens')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${tokens.length} tokens.`);
    tokens.forEach((t, i) => {
        console.log(`[${i}] Token: ${t.token?.substring(0, 20)}... | App: ${t.app_type} | Device: ${t.device_type} | Updated: ${t.updated_at}`);
    });
}

checkTokens();
