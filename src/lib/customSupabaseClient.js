import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pvuyarsthcahrscwbzlt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dXlhcnN0aGNhaHJzY3diemx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MjYxNzMsImV4cCI6MjA3NDEwMjE3M30.dw3JRpMHUzY2izqrFj9AN2tMTSC_pAfZjG0C2JnBG9I';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);