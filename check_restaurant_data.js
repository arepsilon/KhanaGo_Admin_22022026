const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    console.log('Fetching restaurants...');
    const { data, error } = await supabase
        .from('restaurants')
        .select('id, name, commission_percent, platform_fee_per_order, transaction_charge_percent')
        .order('name');

    if (error) {
        console.error('Error:', error);
    } else {
        console.table(data);
    }

    console.log('\nFetching Global Fee Settings...');
    const { data: fees, error: feeError } = await supabase
        .from('fee_settings')
        .select('*');

    if (feeError) {
        console.error('Fee Error:', feeError);
    } else {
        console.table(fees);
    }
}

checkData();
