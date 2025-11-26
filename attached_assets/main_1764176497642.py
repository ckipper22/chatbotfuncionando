from flask import Flask, request, render_template, url_for, jsonify
import psycopg2
from psycopg2 import sql
from flask_cors import CORS
from datetime import date, datetime
import math
import os
from dotenv import load_dotenv

# ==============================================================================
# 0. CONFIGURAÇÃO DE AMBIENTE
# ==============================================================================
load_dotenv()


# ==============================================================================
# 1. FUNÇÕES DE UTILIDADE E FILTROS JINJA
# ==============================================================================

def safe_int(value):
    """Converte um valor para inteiro de forma segura, aceitando strings e None."""
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (ValueError, TypeError):
        return None


def format_whatsapp_price(value):
    """Formata um valor numérico para o padrão X,XX."""
    if value is None:
        return 'N/A'
    try:
        return f"{float(value):.2f}".replace('.', ',')
    except (ValueError, TypeError):
        return 'N/A'


def datetimeformat(value, format='%d/%m/%Y %H:%M'):
    """Formata um objeto datetime, date ou timestamp do DB."""
    if value is None or value == 'N/A' or value == '-':
        return 'N/A'

    if isinstance(value, date) and not isinstance(value, datetime):
        value = datetime.combine(value, datetime.min.time())

    if isinstance(value, datetime):
        return value.strftime(format)

    return value


def currencyformat(value):
    """Formata um valor numérico para o padrão monetário R$ X.XXX,XX."""
    if value is None or value == 'N/A' or value == '-':
        return 'N/A'
    try:
        return f"R$ {float(value):,.2f}".replace(",", "_TEMP_").replace(".", ",").replace("_TEMP_", ".")
    except (ValueError, TypeError):
        return 'N/A'


def split(value, separator=' '):
    """Divide uma string em uma lista de substrings."""
    if isinstance(value, str):
        return value.split(separator)
    return [value]


app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY')
CORS(app, resources={r"/*": {"origins": "*"}})

# Registra os filtros no ambiente Jinja
app.jinja_env.filters['datetimeformat'] = datetimeformat
app.jinja_env.filters['dateonlyformat'] = lambda value: datetimeformat(value, '%d/%m/%Y')
app.jinja_env.filters['timeonlyformat'] = lambda value: datetimeformat(value, '%H:%M:%S')
app.jinja_env.filters['currencyformat'] = currencyformat
app.jinja_env.filters['split'] = split
app.jinja_env.filters['safe_int'] = safe_int
app.jinja_env.filters['format_whatsapp_price'] = format_whatsapp_price

app.jinja_env.globals['safe_int'] = safe_int

# ==============================================================================
# 2. CONFIGURAÇÕES E DADOS FIXOS
# ==============================================================================

DADOS_SOLICITANTE = {
    'razao': os.getenv('RAZAO_SOCIAL', "Carlos Kipper Ltda"),
    'cnpj': os.getenv('CNPJ', "13.408.443/0001-68"),
    'ie': os.getenv('IE', "090/0055324"),
    'afe': os.getenv('AFE', "7216566"),
    'endereco': os.getenv('ENDERECO',
                          "Avenida Presidente Kennedy, 1754 Bairro: Arco Iris, Panambi - RS, CEP 98280-000"),
    'tel': os.getenv('TELEFONE', "55 98455 7096"),
    'email': os.getenv('EMAIL', "ckipper22@gmail.com"),
    'COD_REDE': int(os.getenv('COD_REDE', 1)),
    'COD_FILIAL': int(os.getenv('COD_FILIAL', 1))
}

DB_CONFIG = {
    "host": os.getenv('DB_HOST', "192.168.1.12"),
    "database": os.getenv('DB_NAME', "sgfpod1"),
    "user": os.getenv('DB_USER', "postgres"),
    "password": os.getenv('DB_PASSWORD', "postgres"),
    "port": int(os.getenv('DB_PORT', 5432))
}


# ==============================================================================
# 3. FUNÇÃO DE BUSCA DE OPÇÕES (REUTILIZÁVEL)
# ==============================================================================

def _fetch_product_options(search_term, cod_rede, cod_filial):
    """Busca múltiplos produtos por descrição."""
    if not search_term or search_term.isdigit():
        return None

    try:
        with psycopg2.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cur:
                SQL_BUSCA_DESCRICAO = """
                    SELECT 
                        t1.cod_reduzido, 
                        t1.nom_produto,
                        t4.vlr_liquido, 
                        t3.qtd_estoque,
                        t5.nom_laborat,
                        t1.vlr_venda 
                    FROM cadprodu t1
                    LEFT JOIN cadestoq t3 ON t1.cod_reduzido = t3.cod_reduzido 
                        AND t3.cod_rede = t1.cod_rede 
                        AND t3.cod_filial = %s 
                    LEFT JOIN desconto_produto_vw AS t4 ON t4.cod_reduzido = t1.cod_reduzido
                    LEFT JOIN public.cadlabor t5 ON t1.cod_laborat = t5.cod_laborat
                    WHERE t1.nom_produto ILIKE %s AND t1.cod_rede = %s
                    ORDER BY 
                        CASE WHEN t3.qtd_estoque > 0 THEN 0 ELSE 1 END,
                        t1.nom_produto                                 
                    LIMIT 10;
                """
                like_term = f"%{search_term}%"
                cur.execute(sql.SQL(SQL_BUSCA_DESCRICAO), (cod_filial, like_term, cod_rede))
                rows_descricao = cur.fetchall()

                if not rows_descricao:
                    return []

                product_options = []
                for row in rows_descricao:
                    cod_reduzido = safe_int(row[0])
                    nome_produto = row[1]
                    vlr_liquido_raw = row[2]
                    qtd_estoque_raw = row[3]
                    nom_laboratorio = row[4]
                    vlr_venda_raw = row[5]

                    vlr_venda_float = float(vlr_venda_raw) if vlr_venda_raw is not None else 0.0
                    vlr_liquido_float = float(vlr_liquido_raw) if vlr_liquido_raw is not None else 0.0
                    qtd_estoque = safe_int(qtd_estoque_raw) if qtd_estoque_raw is not None else 0

                    # CÁLCULO DA MENSAGEM DO WHATSAPP
                    whatsapp_string = ""
                    desconto_percentual = 0.0

                    if vlr_venda_float > 0 and vlr_liquido_float < vlr_venda_float:
                        desconto_percentual = ((vlr_venda_float - vlr_liquido_float) / vlr_venda_float) * 100

                    desconto_str = f"{desconto_percentual:.2f}".replace('.', ',')
                    vlr_liquido_wapp = format_whatsapp_price(vlr_liquido_float)
                    vlr_venda_wapp = format_whatsapp_price(vlr_venda_float)

                    if qtd_estoque > 0:
                        estoque_str = f"Temos {qtd_estoque} unidades em estoque."
                        if desconto_percentual > 0.01:
                            whatsapp_string = (
                                f"**{nome_produto}** está com {desconto_str}% OFF! "
                                f"De R$ {vlr_venda_wapp} por **R$ {vlr_liquido_wapp}** à vista. "
                                f"{estoque_str}"
                            )
                        else:
                            whatsapp_string = (
                                f"**{nome_produto}** por apenas **R$ {vlr_liquido_wapp}** à vista. "
                                f"{estoque_str}"
                            )
                    else:
                        whatsapp_string = (
                            f"Ótima escolha! O preço final para **{nome_produto}** "
                            f"é de **R$ {vlr_liquido_wapp}** à vista. "
                            f"No momento, está esgotado. Gostaria de verificar a encomenda para você?"
                        )

                    product_options.append({
                        'cod_reduzido': cod_reduzido,
                        'nome_produto': nome_produto,
                        'nom_laboratorio': nom_laboratorio if nom_laboratorio else 'N/A',
                        'vlr_venda': currencyformat(vlr_venda_raw),
                        'preco_final_venda': currencyformat(vlr_liquido_raw),
                        'qtd_estoque': qtd_estoque,
                        'whatsapp_string': whatsapp_string,
                        'vlr_venda_raw_float': vlr_venda_float,
                        'vlr_liquido_raw_float': vlr_liquido_float,
                        'desconto_percentual': round(desconto_percentual, 2),
                        'vlr_liquido_wapp': vlr_liquido_wapp
                    })

                return product_options

    except psycopg2.Error as e:
        print(f"Erro de Banco de Dados na busca por descrição: {e}")
        return None
    except Exception as e:
        print(f"Erro inesperado na busca por descrição: {e}")
        return None


# ==============================================================================
# 4. ROTAS DA API
# ==============================================================================

@app.route('/api/status', methods=['GET'])
def api_status():
    """Endpoint para verificar o status da API."""
    try:
        with psycopg2.connect(**DB_CONFIG) as conn:
            db_status = "online"

        return jsonify({
            "status": "online",
            "database": db_status,
            "timestamp": datetime.now().isoformat(),
            "version": "1.0.0"
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500


@app.route('/api/products/search', methods=['GET'])
def api_products_search():
    """API para busca de produtos (live search)."""
    search_term = request.args.get('q', '')

    if not search_term or len(search_term) < 2:
        return jsonify({
            "success": True,
            "query": search_term,
            "count": 0,
            "data": []
        }), 200

    cod_rede = DADOS_SOLICITANTE['COD_REDE']
    cod_filial = DADOS_SOLICITANTE['COD_FILIAL']

    try:
        products = _fetch_product_options(search_term, cod_rede, cod_filial)

        if products is None:
            return jsonify({
                "success": False,
                "error": "Erro ao consultar o banco de dados"
            }), 500

        return jsonify({
            "success": True,
            "query": search_term,
            "count": len(products),
            "data": products
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": "Erro na busca de produtos"
        }), 500


# ==============================================================================
# 5. ROTAS PRINCIPAIS
# ==============================================================================

@app.route('/search_live', methods=['GET'])
def search_live():
    """Rota para Live Search (AJAX)."""
    search_term = request.args.get('search_term', '')

    if not search_term or len(search_term) < 3:
        return jsonify([])

    cod_rede = DADOS_SOLICITANTE['COD_REDE']
    cod_filial = DADOS_SOLICITANTE['COD_FILIAL']

    product_options = _fetch_product_options(search_term, cod_rede, cod_filial)

    if product_options is None:
        return jsonify({'error': 'Erro ao consultar o banco de dados.'}), 500

    return jsonify(product_options)


@app.route('/', methods=['GET'])
@app.route('/produto', methods=['GET'])
def get_product_info():
    """Rota principal para buscar informações de produtos."""
    search_term = request.args.get('search_term') or request.args.get('ean_code', '').strip()

    if ':' in search_term:
        search_term = search_term.split(':')[0]

    is_numeric = search_term and search_term.isdigit()
    cod_rede = DADOS_SOLICITANTE['COD_REDE']
    cod_filial = DADOS_SOLICITANTE['COD_FILIAL']

    context = {
        'search_term': search_term,
        'nome_produto': None,
        'ean_code': None,
        'solicitante': DADOS_SOLICITANTE,
        'now': datetime.now().date()
    }

    if not search_term:
        return render_template('produto.html', **context)

    cod_reduzido = None
    ean_found = None
    product_options = None

    try:
        with psycopg2.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cur:
                # BUSCA POR CÓDIGO NUMÉRICO (EAN OU REDUZIDO)
                if is_numeric:
                    if len(search_term) > 8:
                        SQL_BUSCA = """
                            SELECT cod_reduzido, cod_barra
                            FROM cadcdbar
                            WHERE cod_barra = %s
                            LIMIT 1;
                        """
                        cur.execute(sql.SQL(SQL_BUSCA), (search_term,))
                        row_found = cur.fetchone()

                        if row_found:
                            cod_reduzido = row_found[0]
                            ean_found = row_found[1]
                            context['ean_code'] = ean_found

                    if not cod_reduzido and len(search_term) <= 8:
                        SQL_BUSCA_REDUZIDO = """
                            SELECT t1.cod_reduzido, t2.cod_barra
                            FROM cadprodu t1
                            LEFT JOIN cadcdbar t2 ON t1.cod_reduzido = t2.cod_reduzido
                            WHERE t1.cod_reduzido = %s AND t1.cod_rede = %s
                            LIMIT 1;
                        """
                        cur.execute(sql.SQL(SQL_BUSCA_REDUZIDO), (search_term, cod_rede))
                        row_reduzido = cur.fetchone()

                        if row_reduzido:
                            cod_reduzido = row_reduzido[0]
                            ean_found = row_reduzido[1]
                            context['ean_code'] = ean_found or "Não cadastrado"
                        else:
                            SQL_BUSCA_EAN = """
                                SELECT cod_reduzido, cod_barra
                                FROM cadcdbar
                                WHERE cod_barra = %s
                                LIMIT 1;
                            """
                            cur.execute(sql.SQL(SQL_BUSCA_EAN), (search_term,))
                            row_ean = cur.fetchone()

                            if row_ean:
                                cod_reduzido = row_ean[0]
                                ean_found = row_ean[1]
                                context['ean_code'] = ean_found

                # BUSCA POR DESCRIÇÃO
                if not cod_reduzido:
                    options = _fetch_product_options(search_term, cod_rede, cod_filial)

                    if options is None:
                        return render_template('error.html',
                                               message="Erro ao consultar o banco de dados.",
                                               **context), 500

                    if not options:
                        context['ean_code'] = search_term
                        return render_template('produto.html', nome_produto=None, **context)

                    if len(options) > 1:
                        return render_template('produto.html',
                                               search_term=search_term,
                                               product_options=options,
                                               solicitante=DADOS_SOLICITANTE,
                                               now=context['now'])
                    elif len(options) == 1:
                        cod_reduzido = options[0]['cod_reduzido']

                # SE NENHUM PRODUTO ENCONTRADO
                if not cod_reduzido:
                    context['ean_code'] = search_term
                    return render_template('produto.html', nome_produto=None, **context)

                # CONSULTA DE DADOS COMPLETOS DO PRODUTO
                SQL_PRODUTO_FULL = """
                    SELECT
                        t2.nom_local, t2.vlr_venda, t2.nom_produto,
                        t3.qtd_estoque, t3.est_minimo, t4.vlr_liquido,
                        t5.nom_laborat
                    FROM cadprodu t2
                    LEFT JOIN cadestoq t3 ON t2.cod_reduzido = t3.cod_reduzido AND t3.cod_rede = %s AND t3.cod_filial = %s
                    LEFT JOIN desconto_produto_vw AS t4 ON t4.cod_reduzido = t2.cod_reduzido
                    LEFT JOIN public.cadlabor t5 ON t2.cod_laborat = t5.cod_laborat 
                    WHERE t2.cod_reduzido = %s AND t2.cod_rede = %s
                """
                cur.execute(sql.SQL(SQL_PRODUTO_FULL), (cod_rede, cod_filial, cod_reduzido, cod_rede))
                row = cur.fetchone()

                if row is None:
                    return render_template('produto.html', nome_produto=None, **context)

                localizacao, valor_venda, nome_produto, quantidade_em_estoque, estoque_minimo, preco_final_venda, nom_laboratorio = row
                nom_laboratorio = nom_laboratorio if nom_laboratorio else "Não cadastrado"

                # CONSULTA DE ÚLTIMA VENDA
                SQL_ULTIMA_VENDA = """
                    SELECT dat_atualiza
                    FROM cadinfis
                    WHERE cod_reduzido = %s AND cod_rede = %s AND cod_filial = %s
                    ORDER BY dat_atualiza DESC
                    LIMIT 1
                """
                cur.execute(sql.SQL(SQL_ULTIMA_VENDA), (cod_reduzido, cod_rede, cod_filial))
                ultima_venda_db = cur.fetchone()
                ultima_compra = ultima_venda_db[0] if ultima_venda_db else None

                # CONSULTA DE ÚLTIMAS ENTRADAS
                SQL_LOTES_ENTRADAS = """
                SELECT 
                    t1.dat_entrada, t1.qtd_produto, t2.num_lote, t3.dat_fabric, 
                    t3.dat_valid, t3.qtd_saldo, t1.cod_fornec, t1.num_nota,
                    t4.nom_fornec 
                FROM public.cadicomp t1
                INNER JOIN public.cadlentd t2 ON t2.cod_reduzido = t1.cod_reduzido 
                    AND t2.num_nota = t1.num_nota 
                    AND t2.cod_rede = t1.cod_rede 
                    AND t2.cod_filial = t1.cod_filial
                LEFT JOIN public.cadloted t3 ON t3.num_lote = t2.num_lote
                LEFT JOIN public.cadforne t4 ON t4.cod_fornec = t1.cod_fornec AND t4.cod_rede = t1.cod_rede 
                WHERE t1.cod_reduzido = %s AND t1.cod_rede = %s AND t1.cod_filial = %s
                ORDER BY t1.dat_entrada DESC, t1.num_nota DESC, t1.cod_fornec DESC
                LIMIT 3;
                """
                cur.execute(sql.SQL(SQL_LOTES_ENTRADAS), (cod_reduzido, cod_rede, cod_filial))
                lotes_entradas_db = cur.fetchall()

                # PROCESSAMENTO DAS ENTRADAS
                entradas_formatadas = []
                quantidade_ultima_entrada_calc = 0
                data_ultima_entrada = None
                quantidade_ultima_entrada = None
                data_penultima_entrada = None

                for idx, item in enumerate(lotes_entradas_db):
                    qtd_entrada = safe_int(item[1]) if item[1] is not None else 'N/A'

                    entradas_formatadas.append({
                        'indice': idx + 1,
                        'data_entrada': item[0],
                        'qtd_entrada': qtd_entrada,
                        'num_lote': item[2] if item[2] else 'N/A',
                        'data_fabric': item[3],
                        'data_valid': item[4],
                        'qtd_saldo': safe_int(item[5]) if item[5] is not None else 'N/A',
                        'cod_fornec': item[6],
                        'num_nota': item[7],
                        'nome_fornec': item[8] if item[8] else 'N/A'
                    })

                if entradas_formatadas:
                    data_ultima_entrada = entradas_formatadas[0]['data_entrada']
                    quantidade_ultima_entrada = entradas_formatadas[0]['qtd_entrada']

                    qtd_entrada_num = safe_int(quantidade_ultima_entrada)
                    if qtd_entrada_num is not None:
                        quantidade_ultima_entrada_calc = qtd_entrada_num

                    if len(entradas_formatadas) >= 2:
                        data_penultima_entrada = entradas_formatadas[1]['data_entrada']

                estoque_anterior_entrada = "N/A"
                estoque_atual_num = safe_int(quantidade_em_estoque)

                if estoque_atual_num is not None:
                    if quantidade_ultima_entrada_calc > 0:
                        estoque_anterior_entrada = estoque_atual_num - quantidade_ultima_entrada_calc
                    else:
                        estoque_anterior_entrada = estoque_atual_num

                if quantidade_em_estoque == "Não cadastrado" or estoque_atual_num is None:
                    estoque_anterior_entrada = "N/A"

                # CONSULTA DE ÚLTIMAS VENDAS
                SQL_ULTIMAS_VENDAS = """
                    SELECT
                        t1.dat_atualiza, t1.qtd_produto, (t1.vlr_total / t1.qtd_produto) AS vlr_unitario_final, 
                        STRING_AGG(t6.num_lote || ' (' || t6.qtd_lote || ')', ', ') AS lotes_vendidos,
                        t3.nom_usuario, t4.nom_cliente, t1.num_nota, t1.num_sequencial
                    FROM cadinfis t1
                    INNER JOIN public.cadcnfis t2 ON t2.num_nota = t1.num_nota
                        AND t2.cod_rede = t1.cod_rede AND t2.cod_filial = t1.cod_filial
                    LEFT JOIN public.cadcvend t5 ON t5.cod_rede = t2.cod_rede 
                        AND t5.cod_filial = t2.cod_filial AND t5.num_nota = t2.num_controle
                    LEFT JOIN public.cadusuar t3 ON t3.cod_usuario = t5.cod_vendedor
                    LEFT JOIN public.cadclien t4 ON t4.cod_cliente = t2.cod_cliente
                    LEFT JOIN public.cadlvend t6 ON t6.cod_rede = t1.cod_rede
                        AND t6.cod_filial = t1.cod_filial AND t6.num_nota = t2.num_controle
                        AND t6.num_seqcadivend = t1.num_sequencial
                    WHERE t1.cod_reduzido = %s AND t1.cod_rede = %s AND t1.cod_filial = %s
                    GROUP BY 1, 2, 3, 5, 6, 7, 8
                    ORDER BY t1.dat_atualiza DESC, t1.num_nota DESC, t1.num_sequencial DESC
                    LIMIT 3
                """
                cur.execute(sql.SQL(SQL_ULTIMAS_VENDAS), (cod_reduzido, cod_rede, cod_filial))
                ultimas_vendas_db = cur.fetchall()

                # PROCESSAMENTO DAS VENDAS
                vendas_formatadas = []
                for idx, item in enumerate(ultimas_vendas_db):
                    vendas_formatadas.append({
                        'indice': idx + 1,
                        'data_hora_venda': item[0],
                        'qtd_venda': item[1],
                        'valor_unitario': item[2],
                        'num_lote': item[3] if item[3] else 'Não Loteado/Erro de Busca',
                        'nome_vendedor': item[4] if item[4] else 'N/A',
                        'nome_cliente': item[5] if item[5] else 'Consumidor Final',
                        'num_nota': item[6],
                        'num_sequencial': item[7]
                    })

    except psycopg2.Error as e:
        print(f"Erro de Banco de Dados: {e}")
        return render_template('error.html',
                               message=f"Erro ao consultar o banco de dados. Detalhe: {e}",
                               **context), 500
    except Exception as e:
        print(f"Erro inesperado: {e}")
        return render_template('error.html', message="Ocorreu um erro inesperado.", **context), 500

    # FORMATAÇÃO FINAL
    localizacao = localizacao if localizacao else "Sem localização cadastrada"
    estoque_minimo = safe_int(estoque_minimo) if estoque_minimo is not None else "Não cadastrado"
    quantidade_em_estoque = safe_int(quantidade_em_estoque) if quantidade_em_estoque is not None else "Não cadastrado"

    context.update({
        'cod_reduzido': cod_reduzido,
        'nome_produto': nome_produto,
        'localizacao': localizacao,
        'quantidade_em_estoque': quantidade_em_estoque,
        'valor_venda': valor_venda,
        'estoque_minimo': estoque_minimo,
        'preco_final_venda': preco_final_venda,
        'nom_laboratorio': nom_laboratorio,
        'ultima_compra': ultima_compra,
        'data_ultima_entrada': data_ultima_entrada,
        'quantidade_ultima_entrada': quantidade_ultima_entrada,
        'lotes_entradas': entradas_formatadas,
        'ultimas_vendas': vendas_formatadas,
        'estoque_anterior_entrada': estoque_anterior_entrada,
        'data_penultima_entrada': data_penultima_entrada,
        'product_options': None
    })

    return render_template('produto.html', **context)


@app.route('/carta_correcao', methods=['GET', 'POST'])
def gerar_carta_correcao():
    """Gera dados para o template de Carta de Correção."""
    if request.method == 'POST':
        # Recebe os dados do formulário
        cod_reduzido = request.form.get('cod_reduzido')
        num_nota = request.form.get('num_nota')
        cod_fornec = request.form.get('cod_fornec')
        produto_nome = request.form.get('produto_nome')
        quantidade = request.form.get('quantidade')

        # Dados atuais (NF)
        lote_atual = request.form.get('lote_atual')
        validade_atual = request.form.get('validade_atual')
        fabricacao_atual = request.form.get('fabricacao_atual')

        # Dados corretos (embalagem)
        lote_correto = request.form.get('lote_correto')
        validade_correta = request.form.get('validade_correta')
        fabricacao_correta = request.form.get('fabricacao_correta')
        observacoes = request.form.get('observacoes', '')

        # Buscar dados adicionais da NF
        cod_rede = DADOS_SOLICITANTE['COD_REDE']
        cod_filial = DADOS_SOLICITANTE['COD_FILIAL']

        fornecedor_razao = ''
        fornecedor_cnpj = ''
        nf_data = ''
        nf_chave = ''

        if num_nota and cod_fornec:
            try:
                with psycopg2.connect(**DB_CONFIG) as conn:
                    with conn.cursor() as cur:
                        SQL_NF_FORNEC = """
                        SELECT t2.nom_fornec, t2.num_cnpj, t1.dat_emissao, t1.nom_chavenfe
                        FROM public.cadccomp t1
                        INNER JOIN public.cadforne t2 ON t1.cod_fornec = t2.cod_fornec AND t1.cod_rede = t2.cod_rede
                        WHERE t1.num_nota = %s AND t1.cod_fornec = %s AND t1.cod_rede = %s AND t1.cod_filial = %s
                        ORDER BY t1.dat_emissao DESC
                        LIMIT 1;
                        """
                        cur.execute(sql.SQL(SQL_NF_FORNEC), (num_nota, cod_fornec, cod_rede, cod_filial))
                        row_nf_fornec = cur.fetchone()

                        if row_nf_fornec:
                            fornecedor_razao = row_nf_fornec[0] if row_nf_fornec[0] else ''
                            fornecedor_cnpj = row_nf_fornec[1] if row_nf_fornec[1] else ''
                            nf_data_raw = row_nf_fornec[2]
                            nf_data = datetimeformat(nf_data_raw, '%d/%m/%Y') if nf_data_raw else ''
                            nf_chave = row_nf_fornec[3] if row_nf_fornec[3] else ''

            except psycopg2.Error as e:
                print(f"Erro ao buscar dados da NF/Fornecedor (Carta Correção): {e}")

        return render_template('carta_correcao.html',
                               solicitante=DADOS_SOLICITANTE,
                               produto_nome=produto_nome,
                               cod_reduzido=cod_reduzido,
                               fornecedor_razao=fornecedor_razao,
                               fornecedor_cnpj=fornecedor_cnpj,
                               nf_numero=num_nota if num_nota else '',
                               nf_data=nf_data,
                               nf_chave=nf_chave,
                               quantidade=quantidade,
                               # Dados atuais (NF)
                               lote_atual=lote_atual,
                               validade_atual=validade_atual,
                               fabricacao_atual=fabricacao_atual,
                               # Dados corretos (embalagem)
                               lote_correto=lote_correto,
                               validade_correta=validade_correta,
                               fabricacao_correta=fabricacao_correta,
                               observacoes=observacoes,
                               data_hoje=datetime.now().strftime('%d/%m/%Y'))

    else:
        # Método GET (mantém compatibilidade com links existentes)
        cod_reduzido = request.args.get('cod_reduzido')
        num_nota = request.args.get('num_nota')
        cod_fornec = request.args.get('cod_fornec')
        nf_lote = request.args.get('lote')
        nf_validade = request.args.get('validade')
        nf_fabricacao = request.args.get('fabricacao')
        produto_nome = request.args.get('produto_nome')

        cod_rede = DADOS_SOLICITANTE['COD_REDE']
        cod_filial = DADOS_SOLICITANTE['COD_FILIAL']

        fornecedor_razao = ''
        fornecedor_cnpj = ''
        nf_data = ''
        nf_chave = ''

        if num_nota and cod_fornec:
            try:
                with psycopg2.connect(**DB_CONFIG) as conn:
                    with conn.cursor() as cur:
                        SQL_NF_FORNEC = """
                        SELECT t2.nom_fornec, t2.num_cnpj, t1.dat_emissao, t1.nom_chavenfe
                        FROM public.cadccomp t1
                        INNER JOIN public.cadforne t2 ON t1.cod_fornec = t2.cod_fornec AND t1.cod_rede = t2.cod_rede
                        WHERE t1.num_nota = %s AND t1.cod_fornec = %s AND t1.cod_rede = %s AND t1.cod_filial = %s
                        ORDER BY t1.dat_emissao DESC
                        LIMIT 1;
                        """
                        cur.execute(sql.SQL(SQL_NF_FORNEC), (num_nota, cod_fornec, cod_rede, cod_filial))
                        row_nf_fornec = cur.fetchone()

                        if row_nf_fornec:
                            fornecedor_razao = row_nf_fornec[0] if row_nf_fornec[0] else ''
                            fornecedor_cnpj = row_nf_fornec[1] if row_nf_fornec[1] else ''
                            nf_data_raw = row_nf_fornec[2]
                            nf_data = datetimeformat(nf_data_raw, '%d/%m/%Y') if nf_data_raw else ''
                            nf_chave = row_nf_fornec[3] if row_nf_fornec[3] else ''

            except psycopg2.Error as e:
                print(f"Erro ao buscar dados da NF/Fornecedor (Carta Correção): {e}")

        return render_template('carta_correcao.html', solicitante=DADOS_SOLICITANTE,
                               nf_lote_errado=nf_lote if nf_lote != 'N/A' else '',
                               nf_validade_errada=nf_validade if nf_validade != 'N/A' else '',
                               nf_fabricacao_errada=nf_fabricacao if nf_fabricacao != 'N/A' else '',
                               produto_nome=produto_nome, cod_reduzido=cod_reduzido,
                               fornecedor_razao=fornecedor_razao, fornecedor_cnpj=fornecedor_cnpj,
                               nf_numero=num_nota if num_nota else '', nf_data=nf_data, nf_chave=nf_chave,
                               data_hoje=datetime.now().strftime('%d/%m/%Y'))


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)