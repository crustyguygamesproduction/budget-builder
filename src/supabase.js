import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://itayxahonejogrnkhlkp.supabase.co'
const supabaseKey = 'sb_publishable_Zs-_AHRJYHksI79sBwGBsg_2NIN-baE'

export const supabase = createClient(supabaseUrl, supabaseKey)