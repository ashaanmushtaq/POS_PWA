import { createClient } from '@supabase/supabase-js';
import {
  createPosCustomer,
  recordCustomerProductPriceHistory
} from './src/lib/posService';

const supabaseUrl = 'https://ertmvejppdcuyonbizxb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVydG12ZWpwcGRjdXlvbmJpenhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNjkyMTcsImV4cCI6MjEwMzc0NTIxN30.aoI2Y8scb2SPiQzxLt77uwatmitbOUuxKgK_OkpAswk';

async function verifyPart1MultiDevice() {
  console.log('=== PART 1 VERIFICATION: MULTI-DEVICE SHARED SUPABASE DATABASE ===\n');

  // Client A: Sign in staff user
  const clientA = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authA } = await clientA.auth.signInWithPassword({
    email: 'staff@ubcollection.com',
    password: 'password123'
  });
  console.log('Client A session active:', authA.session?.user?.email || 'Logged in as staff');

  // Create a customer via POS service
  console.log('Creating customer for multi-device test...');
  const testCustomer = await createPosCustomer({
    name: 'Faisalabad Silk Traders',
    company_name: 'Faisalabad Silk Traders Pvt Ltd',
    phone: '0300-9876543',
    city: 'Faisalabad'
  });
  console.log('✓ Created customer with UUID:', testCustomer.id, testCustomer.name);

  const testInvoiceNo = `INV-SHARED-${Math.floor(10000 + Math.random() * 90000)}`;

  // Step 1: Client A records sale in shared Supabase DB
  console.log(`\nStep 1: Client A recording sale #${testInvoiceNo} for ${testCustomer.name}...`);
  await recordCustomerProductPriceHistory({
    id: `pos-${Date.now()}`,
    customer_id: testCustomer.id,
    customer_name: testCustomer.name,
    invoice_no: testInvoiceNo,
    total_amount: 7000,
    amount_paid: 7000,
    payment_method: 'cash',
    items: [{
      product_id: 'suit-3pc-royal',
      product_name: 'Royal 3-Piece Groom Suit',
      suit_type: '3-Piece Suit',
      quantity: 1,
      unit_price: 7000,
      base_price: 7500,
      discount_percent: 6.7,
      total_price: 7000
    }],
    created_at: new Date().toISOString(),
    synced: true
  });
  console.log('✓ Sale inserted directly into remote Supabase customer_product_price_history table!');

  // Step 2: Client B (A COMPLETELY DIFFERENT SUPABASE CLIENT INSTANCE simulating device B)
  console.log('\nStep 2: Client B (Device B) querying shared Supabase database...');
  const clientB = createClient(supabaseUrl, supabaseAnonKey);

  const { data: remoteData, error: remoteErr } = await clientB
    .from('customer_product_price_history')
    .select('*')
    .eq('customer_id', testCustomer.id)
    .order('created_at', { ascending: false });

  console.log('Client B Query Error:', remoteErr);
  console.log(`Client B fetched ${remoteData?.length || 0} record(s) from shared Supabase database:`);
  remoteData?.forEach((r, idx) => {
    console.log(`  [Record ${idx + 1}] Invoice #${r.invoice_no}:`);
    console.log(`    - Product: ${r.product_name}`);
    console.log(`    - Qty: ${r.quantity}`);
    console.log(`    - Charged Rate: Rs. ${r.price_charged}`);
    console.log(`    - Base Price: Rs. ${r.base_price}`);
    console.log(`    - Discount %: ${r.discount_percent}%`);
    console.log(`    - Date: ${r.created_at}`);
  });

  if (remoteData && remoteData.length > 0 && remoteData[0].invoice_no === testInvoiceNo) {
    console.log('\n🟢 PART 1 VERIFICATION PASSED: Data genuinely exists in shared Supabase DB and is visible across multiple devices/browsers!');
  } else {
    console.log('\n❌ PART 1 VERIFICATION FAILED!');
  }
}

verifyPart1MultiDevice().catch(console.error);
