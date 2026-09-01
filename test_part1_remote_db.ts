import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ertmvejppdcuyonbizxb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVydG12ZWpwcGRjdXlvbmJpenhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNjkyMTcsImV4cCI6MjEwMzc0NTIxN30.aoI2Y8scb2SPiQzxLt77uwatmitbOUuxKgK_OkpAswk';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testRemoteTable() {
  console.log('=== PART 1: VERIFYING REMOTE SUPABASE TABLES EXISTENCE ===');

  // Sign in as staff user
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'staff@ubcollection.com',
    password: 'password123'
  });
  console.log('Auth login:', authData.session ? 'LOGGED IN' : 'FAILED', authErr?.message);

  // 1. Query customer_product_price_history directly
  const { data: historyData, error: historyErr } = await supabase
    .from('customer_product_price_history')
    .select('*')
    .limit(5);

  console.log('\n--- customer_product_price_history REMOTE TABLE QUERY ---');
  console.log('Query Error:', historyErr);
  console.log('Query Data:', historyData);

  if (historyErr === null) {
    console.log('🟢 SUCCESS: customer_product_price_history table EXISTS and is fully queryable on remote Supabase!');
  } else {
    console.log('❌ ERROR: Table query failed:', historyErr.message);
  }

  // 2. Query customer_payment_plans directly
  const { data: plansData, error: plansErr } = await supabase
    .from('customer_payment_plans')
    .select('*')
    .limit(5);

  console.log('\n--- customer_payment_plans REMOTE TABLE QUERY ---');
  console.log('Query Error:', plansErr);
  console.log('Query Data:', plansData);

  if (plansErr === null) {
    console.log('🟢 SUCCESS: customer_payment_plans table EXISTS and is fully queryable on remote Supabase!');
  }
}

testRemoteTable();
