
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://icbpcizlfixbtlprwopv.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljYnBjaXpsZml4YnBscndvcHYiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTcyMTg5OTg2MiwiZXhwIjoyMDM3NDc1ODYyfQ.o_sBv93y2a4-Yp8t3B41yV2rUj-j2o_u9sJFA2y2GgA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
