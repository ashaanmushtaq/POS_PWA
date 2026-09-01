import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ertmvejppdcuyonbizxb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVydG12ZWpwcGRjdXlvbmJpenhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNjkyMTcsImV4cCI6MjEwMzc0NTIxN30.aoI2Y8scb2SPiQzxLt77uwatmitbOUuxKgK_OkpAswk';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function diagnoseHistory() {
  console.log('--- DIAGNOSING CUSTOMER PRICE HISTORY ---');

  // Sign in as staff/owner user
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'staff@ubcollection.com',
    password: 'password123'
  });
  console.log('Auth:', authData.session ? 'LOGGED IN' : 'NOT LOGGED IN', authErr?.message);

  // 1. Check if customer_product_price_history table exists and read RLS
  const { data: readData, error: readErr } = await supabase
    .from('customer_product_price_history')
    .select('*')
    .limit(10);

  console.log('\n--- READ SIDE DIAGNOSIS ---');
  console.log('Read Error:', readErr);
  console.log('Read Data:', readData);

  // 2. Check customer_sales table
  const { data: salesData, error: salesErr } = await supabase
    .from('customer_sales')
    .select('*')
    .limit(5);

  console.log('\n--- CUSTOMER SALES ---');
  console.log('Sales Error:', salesErr?.message);
  console.log('Sales Count:', salesData?.length);

  // 3. Test Write Side
  const { data: custData } = await supabase.from('customers').select('id, name').limit(1);
  if (custData && custData.length > 0) {
    const cust = custData[0];
    console.log('\n--- WRITE SIDE DIAGNOSIS ---');
    console.log('Test customer:', cust);

    const testInsert = {
      customer_id: cust.id,
      customer_name: cust.name,
      product_id: 'test-prod-1',
      product_name: 'Test Product',
      price_charged: 1000,
      base_price: 1100,
      discount_percent: 9.1,
      quantity: 1,
      invoice_no: 'TEST-INV-1'
    };

    const { data: insData, error: insErr } = await supabase
      .from('customer_product_price_history')
      .insert([testInsert])
      .select();

    console.log('Insert Error:', insErr);
    console.log('Inserted Data:', insData);
  }
}

diagnoseHistory();
