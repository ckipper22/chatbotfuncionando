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
    is_active: true,
    webhook_url: '' 
});

// =========================================================================
// 1. SEUS DETECTORES ORIGINAIS (RESTAURADOS LINHA POR LINHA)
// =========================================================================
const SAUDACOES = ['olá', 'ola', 'oi', 'hey', 'hello', 'hi', 'eae', 'opa', 'menu', 'inicio', 'início'];

function ehSaudacao(mensagem: string): boolean {
    const msgLimpa = mensagem.toLowerCase().replace(/[?!.,]/g, '').trim();
    return SAUDACOES.includes(msgLimpa);
}

function ehPerguntaMedicaOuMedicamento(mensagem: string): boolean {
    const msgMin = mensagem.toLowerCase();
    const palavrasChave = ['posologia', 'dosagem', 'dose', 'para que serve', 'efeito colateral', 'como tomar', 'contraindicação'];
    return palavrasChave.some(p => msgMin.includes(p));
}

function extrairTermoBuscaInteligente(mensagem: string): { buscar: boolean, termo: string } {
    let msgMin = mensagem.toLowerCase().trim();
    const stopWords = ['tem', 'gostaria', 'quero', 'preciso', 'buscar', 'preço', 'valor'];
    msgMin = msgMin.replace(/[?!.,]*$/, '');
    
    for (const word of stopWords) {
        if (msgMin.startsWith(word + ' ')) msgMin = msgMin.substring(word.length).trim();
    }
    
    if (ehSaudacao(msgMin) || ehPerguntaMedicaOuMedicamento(msgMin)) return { buscar: false, termo: '' };
    
    const palavras = msgMin.split(' ');
    // Se for curto (nome de remédio), buscar no estoque
    if (palavras.length > 0 && palavras.length < 5) return { buscar: true, termo: msgMin };
    return { buscar: false, termo: '' };
}

// =========================================================================
// 2. HISTÓRICO E BANCO (RESTAURADOS)
// =========================================================================
async function registrarNoBanco(phoneId: string, from: string, msg: string, dir: 'IN' | 'OUT') {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ whatsapp_phone_id: phoneId, from_number: from, message_body: msg, direction: dir })
        });
    } catch (e) { console.error("[DB ERROR]", e); }
}

// =========================================================================
// 3. FLUXO PRINCIPAL (HÍBRIDO: LÓGICA MASTER + BOTÕES)
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
        const textoOriginal = msg.text?.body || "";
        const textoParaProcessar = buttonReply ? buttonReply.title : textoOriginal;

        // Registro de entrada
        await registrarNoBanco(phoneId, from, textoParaProcessar, 'IN');

        // Busca Farmácia (Multitenant)
        const resDB = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const farmacia = (await resDB.json())?.[0];
        if (!farmacia) return NextResponse.json({ status: 'error' });

        // LÓGICA DE DECISÃO
        
        // A) Clique em Botão de Compra
        if (buttonReply?.id.startsWith('buy_')) {
            const cod = buttonReply.id.replace('buy_', '');
            const confirm = `🛒 *Pedido em Andamento!*\n\nReservamos o item #${cod} na unidade ${farmacia.name || farmacia.db_name}. Como prefere finalizar?`;
            await whatsapp.sendTextMessage(from, confirm);
            await registrarNoBanco(phoneId, from, confirm, 'OUT');
            return NextResponse.json({ status: 'ok' });
        }

        // B) Saudação
        if (ehSaudacao(textoParaProcessar)) {
            const boasVindas = `Olá! Bem-vindo à ${farmacia.name || 'nossa farmácia'}. Como posso ajudar hoje?`;
            await whatsapp.sendTextMessage(from, boasVindas);
            await registrarNoBanco(phoneId, from, boasVindas, 'OUT');
            return NextResponse.json({ status: 'ok' });
        }

        // C) Busca de Estoque (Usa sua extração inteligente)
        const { buscar, termo } = extrairTermoBuscaInteligente(textoParaProcessar);
        if (buscar) {
            try {
                const resEst = await fetch(`${farmacia.api_base_url}/api/products/search?q=${encodeURIComponent(termo)}`);
                const estData = await resEst.json();

                if (estData?.data?.length > 0) {
                    const p = estData.data[0];
                    const msgEstoque = `📦 *${p.nome_produto}*\n💰 R$ ${p.preco_final_venda}\n✅ Estoque: ${p.qtd_estoque}`;
                    
                    await whatsapp.sendInteractiveButtons(from, msgEstoque, [
                        { id: `buy_${p.cod_reduzido}`, title: "🛒 Comprar" },
                        { id: `menu`, title: "🏠 Menu Principal" }
                    ]);
                    await registrarNoBanco(phoneId, from, `Ofertado: ${p.nome_produto}`, 'OUT');
                    return NextResponse.json({ status: 'ok' });
                }
            } catch (e) { console.warn("API Local offline"); }
        }

        // D) IA Especialista (Rosácea, Ácido Úrico e Geral)
        const promptIA = `Você é o assistente da farmácia ${farmacia.name}. 
        REGRAS DE ALIMENTAÇÃO:
        - Rosácea: Foco Ancestral. Sim: carne gorda, fígado, caldo osso, arroz branco, abacate, limão. Não: grãos, leite, café, frutas doces.
        - Ácido Úrico: Cuidado com frutose e inflamatórios.
        Pergunta: ${textoParaProcessar}`;

        const resG = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptIA }] }] })
        });
        const dataG = await resG.json();
        const respIA = dataG.candidates?.[0]?.content?.parts?.[0]?.text || "Pode repetir?";

        await whatsapp.sendTextMessage(from, respIA);
        await registrarNoBanco(phoneId, from, respIA, 'OUT');

        return NextResponse.json({ status: 'ok' });

    } catch (e) {
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
