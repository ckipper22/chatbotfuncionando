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
// FUNÇÕES DE TELEMETRIA E BANCO
// =========================================================================

async function registrarNoBanco(phoneId: string, from: string, msg: string, dir: 'IN' | 'OUT') {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
            method: 'POST',
            headers: { 
                'apikey': SUPABASE_ANON_KEY!, 
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ 
                whatsapp_phone_id: phoneId, 
                from_number: from, 
                message_body: msg, 
                direction: dir 
            })
        });
        if (res.ok) console.log(`[DB] ✅ Histórico ${dir} salvo.`);
    } catch (e) { console.error("[DB ERROR] Falha no log:", e); }
}

// =========================================================================
// HANDLER PRINCIPAL
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (!msg) return NextResponse.json({ status: 'ok' });

        const from = msg.from;
        const textoOriginal = msg.text?.body || "";
        const buttonReply = msg.interactive?.button_reply;
        
        // Se for botão, usamos o título dele para a lógica
        const textoParaProcessar = buttonReply ? buttonReply.title : textoOriginal;

        console.log(`\n🚀 [RECEBIDO] De: ${from} | Msg: ${textoParaProcessar}`);
        await registrarNoBanco(phoneId, from, textoParaProcessar, 'IN');

        // 1. BUSCA FARMÁCIA (MULTITENANT)
        const resDB = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const farmacia = (await resDB.json())?.[0];
        
        if (!farmacia) {
            console.error(`[DB ERROR] Farmácia não cadastrada para o ID: ${phoneId}`);
            return NextResponse.json({ status: 'not_found' });
        }
        console.log(`[TENANT] ✅ Farmácia Localizada: ${farmacia.name}`);

        // 2. TRATAMENTO DE CLIQUE NO BOTÃO COMPRAR
        if (buttonReply?.id.startsWith('buy_')) {
            const cod = buttonReply.id.replace('buy_', '');
            const confirm = `🛒 Perfeito! Produto #${cod} selecionado. Gostaria de finalizar o pedido agora?`;
            await whatsapp.sendTextMessage(from, confirm);
            await registrarNoBanco(phoneId, from, confirm, 'OUT');
            return NextResponse.json({ status: 'ok' });
        }

        // 3. BUSCA DE PRODUTO NO ESTOQUE (IP FIXO DO SUPABASE)
        // Lógica: Se for uma busca curta, prioriza estoque
        if (textoParaProcessar.trim().split(' ').length <= 2 && textoParaProcessar.length > 2) {
            console.log(`[ESTOQUE] 🔍 Buscando "${textoParaProcessar}" em: ${farmacia.api_base_url}`);
            try {
                const resEstoque = await fetch(`${farmacia.api_base_url}/api/products/search?q=${encodeURIComponent(textoParaProcessar)}`);
                const estoqueData = await resEstoque.json();

                if (estoqueData?.data?.length > 0) {
                    const p = estoqueData.data[0];
                    const msgBotao = `📦 *${p.nome_produto}*\n💰 Valor: R$ ${p.preco_final_venda}\n✅ Estoque: ${p.qtd_estoque}`;
                    
                    await whatsapp.sendInteractiveButtons(from, msgBotao, [
                        { id: `buy_${p.cod_reduzido}`, title: "🛒 Comprar" },
                        { id: `outro`, title: "🔍 Ver outro" }
                    ]);
                    await registrarNoBanco(phoneId, from, `Oferta: ${p.nome_produto}`, 'OUT');
                    return NextResponse.json({ status: 'ok' });
                }
            } catch (e) { console.warn("[ESTOQUE] ⚠️ API local offline."); }
        }

        // 4. FALLBACK: GEMINI
        const urlG = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const resG = await fetch(urlG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: textoParaProcessar }] }] })
        });
        const dataG = await resG.json();
        const respostaIA = dataG.candidates?.[0]?.content?.parts?.[0]?.text || "Como posso ajudar?";

        await whatsapp.sendTextMessage(from, respostaIA);
        await registrarNoBanco(phoneId, from, respostaIA, 'OUT');

        return NextResponse.json({ status: 'ok' });

    } catch (e) {
        console.error("[CRITICAL]", e);
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
