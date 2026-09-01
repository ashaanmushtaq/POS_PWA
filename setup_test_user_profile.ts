import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ertmvejppdcuyonbizxb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVydG12ZWpwcGRjdXlvbmJpenhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNjkyMTcsImV4cCI6MjEwMzc0NTIxN30.aoI2Y8scb2SPiQzxLt77uwatmitbOUuxKgK_OkpAswk';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupProfile() {
  console.log('=== SETTING UP TENANT & PROFILE FOR TEST USERS ===');

  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'staff@ubcollection.com',
    password: 'password123'
  });

  if (authData.user) {
    console.log('User ID:', authData.user.id);

    // Get active tenant
    const { data: tenants } = await supabase.from('tenants').select('*');
    console.log('Tenants in DB:', tenants);

    // Link profile
    if (tenants && tenants.length > 0) {
      const tenantId = tenants[0].id;
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .upsert({
          id: authData.user.id,
          tenant_id: tenantId,
          full_name: 'Shop Staff User',
          role: 'shop_staff',
          is_active: true
        })
        .select();

      console.log('Profile setup result:', prof, profErr?.message);
    }
  }
}

setupProfile();
