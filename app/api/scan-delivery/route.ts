import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const orderId = searchParams.get('order_id')
  const riderId = searchParams.get('rider_id')

  if (!orderId || !riderId) {
    return new NextResponse('Invalid QR Code', { status: 400 })
  }

  // We are using the admin client to log the scan because the user scanning might not be logged in to the dashboard
  // and we want to allow native camera scanning. However, we need to know WHICH user is scanning.
  // In a real scenario, the QR scan should probably ask the user to login or we should have the user_id in the URL.
  // Based on the requirement: "user scans it and the data is saved (order id, user name, user id, rider name, rider id)".
  
  // Strategy: The URL should ideally be scanned while the user is logged into the Customer App, 
  // but the user said "native camera / QR Scanning App". 
  // This means the web page needs to handle authentication OR we need to pass the user_id if we want to be automated.
  // However, since the QR is unique to the order, we can look up the user_id FROM the order table!

  const supabase = createRouteHandlerClient({ cookies })

  try {
    // 1. Fetch the order to get the user_id (customer_id)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('customer_id, order_number, status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return new NextResponse('Order not found', { status: 404 })
    }

    // 2. Insert into order_qr_scans
    const { error: scanError } = await supabase
      .from('order_qr_scans')
      .insert({
        order_id: orderId,
        user_id: order.customer_id,
        rider_id: riderId
      })

    if (scanError) {
      if (scanError.code === '23505') {
        return new NextResponse(`
          <html>
            <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: #f8fafc;">
              <h1 style="color: #ef4444;">Already Scanned!</h1>
              <p style="color: #64748b;">This delivery QR code has already been verified.</p>
              <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; background: #64748b; color: white; border: none; border-radius: 8px;">Close</button>
            </body>
          </html>
        `, { headers: { 'Content-Type': 'text/html' } })
      }
      throw scanError
    }

    // 3. Check progress (The Postgres trigger handles coupon issuance, we just show progress)
    const { count } = await supabase
      .from('order_qr_scans')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', order.customer_id)
      .eq('is_used_for_coupon', false)
      .gte('scanned_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())

    const scansLeft = 5 - (count || 0)
    
    return new NextResponse(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
        </head>
        <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: #f0fdf4; padding: 20px;">
          <div style="background: white; padding: 40px; border-radius: 24px; shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);">
            <h1 style="color: #16a34a; margin-bottom: 10px;">Delivery Verified! 🎉</h1>
            <p style="color: #64748b; font-size: 18px;">Order #${order.order_number} has been confirmed.</p>
            
            <div style="margin-top: 30px; padding: 20px; background: #f8fafc; border-radius: 16px;">
              ${scansLeft === 0 ? 
                `<h2 style="color: #ea580c; margin: 0;">Reward Unlocked! 🎁</h2>
                 <p style="color: #1e293b; margin-top: 8px;">A free order coupon (up to ₹250) has been added to your account!</p>` : 
                `<h2 style="color: #1e293b; margin: 0;">Loyalty Progress</h2>
                 <p style="color: #64748b; margin-top: 8px;">Scan <b>${scansLeft}</b> more delivery QRs this week to get your next order FREE!</p>
                 <div style="display: flex; gap: 8px; justify-content: center; margin-top: 15px;">
                    ${Array.from({length: 5}).map((_, i) => 
                      `<div style="width: 12px; height: 12px; border-radius: 6px; background: ${i < (count || 0) ? '#16a34a' : '#e2e8f0'};"></div>`
                    ).join('')}
                 </div>`
              }
            </div>
          </div>
          <script>
            ${scansLeft === 0 ? 'confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });' : ''}
          </script>
        </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })

  } catch (error: any) {
    console.error('Scan Error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
