import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS for admin operations
// Only use server-side or in API routes, never expose to browser
export function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}
