import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  console.log('🔍 Webhook verification request received:', { mode, token, challenge })

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ Webhook verified successfully!')
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'ngrok-skip-browser-warning': 'true'
      }
    })
  }

  console.log('❌ Webhook verification failed')
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('📩 Webhook POST received:', JSON.stringify(body, null, 2))

    if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
      const message = body.entry[0].changes[0].value.messages[0]
      console.log('💬 New message:', message)
    }

    return NextResponse.json({ status: 'ok' }, { 
      status: 200,
      headers: {
        'ngrok-skip-browser-warning': 'true'
      }
    })
  } catch (error) {
    console.error('❌ Webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}