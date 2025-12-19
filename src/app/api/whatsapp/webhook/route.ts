import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

const {
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    GEMINI_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY
} = process.env;

const whatsapp = new WhatsAppAPI({
    access_token: WHATSAPP_ACCESS_TOKEN || '',
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID || '',
    webhook_verify_token: WHATSAPP_VERIFY_TOKEN || '',
    is_active: true
});

// =========================================================================
// REGISTRO DE HISTÓRICO (Conforme seu schema public.whatsapp_messages)
// =========================================================================
async function salvarNoHistorico(phoneId: string, from: string, body: string, direction: 'IN' | 'OUT') {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
            method: 'POST',
            headers: { 
                'apikey': SUPABASE_ANON_KEY!, 
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ 
                whatsapp_phone_id: phoneId, 
                from_number: from, 
                message_body: body, 
                direction: direction 
            })
        });
        console.log(`[HISTÓRICO] ✅ ${direction}: ${body.substring(0, 30)}...`);
    } catch (e) {
        console.error("[HISTÓRICO ERROR] Falha ao salvar mensagem:", e);
    }
}

// =========================================================================
// HANDLER WEBHOOK
// =========================================================================
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (!msg) return NextResponse.json({ status: 'ok' });

        const from = msg.from;
        const buttonReply = msg.interactive?.button_reply;
        const textoUsuario = buttonReply ? buttonReply.title : (msg.text?.body || "");

        console.log(`\n--- MENSAGEM RECEBIDA ---`);
        console.log(`[LOG] De: ${from} | Texto: ${textoUsuario}`);
        
        // 1. SALVAR ENTRADA NO HISTÓRICO
        await salvarNoHistorico(phoneId, from, textoUsuario, 'IN');

        // 2. IDENTIFICAR FARMÁCIA (MULTITENANT via client_connections)
        const resDB = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const farmacia = (await resDB.json())?.[0];
        
        if (!farmacia) {
            console.error(`[DB ERROR] ID ${phoneId} não encontrado em client_connections.`);
            return NextResponse.json({ status: 'not_found' });
        }
        console.log(`[TENANT] ✅ Farmácia: ${farmacia.db_name}`);

        // 3. TRATAMENTO DE CLIQUE EM BOTÃO "COMPRAR"
        if (buttonReply?.id.startsWith('buy_')) {
            const cod = buttonReply.id.replace('buy_', '');
            const confirm = `🛒 Ótima escolha! O produto #${cod} foi pré-reservado na ${farmacia.db_name}. Como você prefere receber?`;
            
            await whatsapp.sendTextMessage(from, confirm);
            await salvarNoHistorico(phoneId, from, confirm, 'OUT');
            return NextResponse.json({ status: 'ok' });
        }

        // 4. LÓGICA DE BUSCA NO ESTOQUE (IP FIXO)
        // Se for uma busca curta (produto), consulta API Flask
        if (textoUsuario.trim().split(' ').length <= 2 && textoUsuario.length > 2) {
            try {
                const resEstoque = await fetch(`${farmacia.api_base_url}/api/products/search?q=${encodeURIComponent(textoUsuario)}`, {
                    signal: AbortSignal.timeout(5000)
                });
                const estoque = await resEstoque.json();

                if (estoque?.data?.length > 0) {
                    const p = estoque.data[0];
                    const msgEstoque = `📦 *${p.nome_produto}*\n💰 R$ ${p.preco_final_venda}\n✅ Estoque: ${p.qtd_estoque}`;
                    
                    await whatsapp.sendInteractiveButtons(from, msgEstoque, [
                        { id: `buy_${p.cod_reduzido}`, title: "🛒 Comprar" },
                        { id: `voltar`, title: "🏠 Menu Principal" }
                    ]);
                    
                    await salvarNoHistorico(phoneId, from, `Oferta: ${p.nome_produto}`, 'OUT');
                    return NextResponse.json({ status: 'ok' });
                }
            } catch (e) {
                console.warn("[ESTOQUE] ⚠️ API local inacessível.");
            }
        }

        // 5. FALLBACK: GEMINI (Perguntas sobre Rosácea, Ácido Úrico, etc)
        const resG = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Você é um assistente da farmácia ${farmacia.db_name}. Responda: ${textoUsuario}` }] }]
            })
        });
        const dataG = await resG.json();
        const respostaIA = dataG.candidates?.[0]?.content?.parts?.[0]?.text || "Como posso ajudar?";

        await whatsapp.sendTextMessage(from, respostaIA);
        await salvarNoHistorico(phoneId, from, respostaIA, 'OUT');

        return NextResponse.json({ status: 'ok' });

    } catch (e) {
        console.error("[WEBHOOK FATAL]", e);
        return NextResponse.json({ status: 'error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro', { status: 403 });
}
