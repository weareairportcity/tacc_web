import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use service_role key for backend operations to bypass RLS if needed, or anon key for public operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
