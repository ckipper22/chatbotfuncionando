// Lib/medicamentos_data.ts

// Este arquivo contém dados estruturados de bulas de medicamentos (Bulário Estático).
// Ele é usado como fonte de consulta quando o LLM (Gemini) tem restrições de segurança ou falha ao responder sobre medicamentos.

export interface MedicamentoBula {
    "Nome do Medicamento": string;
    "Princípio(s) Ativo(s)": string[];
    "Classe Farmacológica": string;
    "Mecanismo de Ação": string;
    "Indicações": string;
    "Posologia": string;
    "Contraindicações": string;
    "Efeitos Colaterais": string;
    "Advertências e Precauções": string;
    "Interações Medicamentosas": string; // Novo campo adicionado conforme a necessidade
}

export const medicamentosData: MedicamentoBula[] = [ // Renomeado de bulasEstaticas para medicamentosData
    {
        "Nome do Medicamento": "Losartana",
        "Princípio(s) Ativo(s)": ["Losartana Potássica"],
        "Classe Farmacológica": "Antagonista do Receptor da Angiotensina II (ARA-II)",
        "Mecanismo de Ação": "A losartana atua bloqueando seletivamente os receptores AT1 da angiotensina II, impedindo a vasoconstrição, a liberação de aldosterona e outros efeitos da angiotensina II. Isso resulta em vasodilatação, redução da pressão arterial e diminuição da retenção de sódio e água.",
        "Indicações": "Hipertensão arterial (pressão alta), incluindo casos de hipertrofia ventricular esquerda; insuficiência cardíaca (para reduzir o risco de morbidade e mortalidade, especialmente em pacientes intolerantes a inibidores da ECA); proteção renal em pacientes com diabetes tipo 2 e proteinúria (excreção excessiva de proteínas na urina) para retardar a progressão da doença renal.",
        "Posologia": "Adultos: A dose inicial usual para hipertensão é de 50 mg, uma vez ao dia. Para insuficiência cardíaca, a dose inicial é de 12,5 mg, uma vez ao dia. A dose pode ser ajustada pelo médico, geralmente até 100 mg/dia, dependendo da resposta do paciente e da condição clínica. A administração pode ser feita com ou sem alimentos.",
        "Contraindicações": "Hipersensibilidade conhecida à losartana ou a qualquer componente da fórmula; gravidez (especialmente no segundo e terceiro trimestres, devido ao risco de toxicidade fetal e neonatal); lactação; uso concomitante com alisquireno em pacientes com diabetes mellitus ou insuficiência renal moderada a grave (GFR < 60 mL/min/1.73m²), devido ao aumento do risco de hipotensão, hipercalemia e piora da função renal.",
        "Efeitos Colaterais": "Os efeitos mais comuns incluem tontura, cefaleia e fadiga. Outros efeitos podem ser hipercalemia (aumento de potássio no sangue, devido à inibição da aldosterona), hipotensão ortostática, dor abdominal, diarreia e tosse (menos comum que com inibidores da ECA). Reações mais raras, mas graves, incluem angioedema (inchaço da face, lábios, língua e/ou garganta) e alterações da função renal.",
        "Advertências e Precauções": "É fundamental monitorar a função renal e os níveis de potássio sérico, especialmente em pacientes com insuficiência renal, insuficiência cardíaca, ou naqueles que utilizam diuréticos poupadores de potássio ou suplementos de potássio. Evitar o uso durante a gravidez e, se a gravidez for detectada, descontinuar o medicamento imediatamente. Usar com cautela em pacientes com estenose da artéria renal (risco de piora da função renal) e em pacientes com depleção de volume (desidratação), pois podem apresentar hipotensão sintomática. Interações medicamentosas importantes incluem diuréticos poupadores de potássio, suplementos de potássio, AINEs (podem reduzir o efeito anti-hipertensivo e aumentar o risco de disfunção renal) e lítio (aumenta os níveis séricos de lítio).",
        "Interações Medicamentosas": "Interações importantes incluem diuréticos poupadores de potássio, suplementos de potássio, AINEs (podem reduzir o efeito anti-hipertensivo e aumentar o risco de disfunção renal) e lítio (aumenta os níveis séricos de lítio)."
    },
    {
        "Nome do Medicamento": "Sinvastatina",
        "Princípio(s) Ativo(s)": ["Sinvastatina"],
        "Classe Farmacológica": "Inibidor da HMG-CoA Redutase (Estatina)",
        "Mecanismo de Ação": "A sinvastatina atua inibindo competitivamente a enzima HMG-CoA redutase, que é a enzima limitante da biossíntese do colesterol no fígado. Ao reduzir a produção hepática de colesterol, aumenta-se o número de receptores de LDL na superfície das células hepáticas, o que leva a uma maior captação e catabolismo do LDL-colesterol do sangue, resultando na redução dos níveis de colesterol total, LDL-C e triglicerídeos e um leve aumento do HDL-C.",
        "Indicações": "Hipercolesterolemia primária (colesterol alto) e dislipidemia mista, incluindo hipercolesterolemia familiar homozigótica e heterozigótica; hipertrigliceridemia isolada; prevenção de eventos cardiovasculares (infarto do miocárdio, acidente vascular cerebral, necessidade de revascularização) em pacientes de alto risco, como aqueles com doença arterial coronariana estabelecida, diabetes mellitus, doença vascular periférica ou histórico de AVC. Também indicada para redução do risco de morte por doença arterial coronariana.",
        "Posologia": "Adultos: A dose inicial usualmente varia de 10 mg a 40 mg, uma vez ao dia, preferencialmente à noite. A administração noturna é recomendada porque a biossíntese do colesterol é mais ativa durante a noite. A dose pode ser ajustada pelo médico a intervalos de 4 semanas ou mais, conforme a resposta do paciente e os níveis-alvo de lipídios. A dose máxima recomendada é de 40 mg/dia para a maioria dos pacientes, embora doses mais altas (até 80 mg) possam ser usadas em situações específicas e sob estrita supervisão médica.",
        "Contraindicações": "Hipersensibilidade à sinvastatina ou a qualquer componente da fórmula; doença hepática ativa ou elevações persistentes e inexplicáveis das transaminases séricas (enzimas hepáticas); gravidez e lactação (devido ao potencial teratogênico e à interrupção da biossíntese de esteroides essenciais para o feto/lactente); uso concomitante de inibidores potentes da CYP3A4, como itraconazol, cetoconazol, posaconazol, voriconazol (antifúngicos azólicos), eritromicina, claritromicina, telitromicina (antibióticos macrolídeos), inibidores da protease do HIV (ex: nelfinavir, atazanavir), boceprevir, telaprevir, nefazodona e gemfibrozila.",
        "Efeitos Colaterais": "Os efeitos mais comuns são geralmente leves e transitórios, incluindo mialgia (dor muscular), dor abdominal, constipação, flatulência e cefaleia. Efeitos mais graves, embora raros, incluem miopatia (fraqueza muscular com ou sem elevação de creatina quinase - CK), rabdomiólise (lesão muscular grave que pode levar à insuficiência renal aguda) e disfunção hepática (elevação das transaminases séricas). É crucial que o paciente relate qualquer dor muscular inexplicável, sensibilidade ou fraqueza.",
        "Advertências e Precauções": "É essencial monitorar a função hepática (enzimas transaminases) antes do início do tratamento e periodicamente durante o uso, especialmente se houver sintomas sugestivos de lesão hepática. Avaliar o risco de miopatia/rabdomiólise, que é aumentado em pacientes com fatores de risco (ex: idade avançada, hipotireoidismo não controlado, insuficiência renal, uso concomitante de certos medicamentos). Recomenda-se evitar o consumo excessivo de álcool e sumo de toranja (grapefruit juice), pois este último pode aumentar significativamente os níveis plasmáticos de sinvastatina, elevando o risco de efeitos adversos. Interações medicamentosas com amiodarona, verapamil, diltiazem e anlodipino também requerem cautela e ajuste de dose da sinvastatina.",
        "Interações Medicamentosas": "Interações importantes com inibidores potentes da CYP3A4 (ex: antifúngicos azólicos, antibióticos macrolídeos, inibidores da protease do HIV, nefazodona, gemfibrozila), amiodarona, verapamil, diltiazem e anlodipino."
    },
    {
        "Nome do Medicamento": "Diclofenaco",
        "Princípio(s) Ativo(s)": ["Diclofenaco Sódico", "Diclofenaco Potássico"],
        "Classe Farmacológica": "Anti-inflamatório Não Esteroidal (AINE)",
        "Mecanismo de Ação": "O diclofenaco exerce suas ações analgésica, anti-inflamatória e antipirética principalmente através da inibição da biossíntese de prostaglandinas, que são mediadores da inflamação, dor e febre. Ele atua inibindo as enzimas ciclooxigenase-1 (COX-1) e ciclooxigenase-2 (COX-2). A inibição da COX-1 está associada a efeitos gastrointestinais, enquanto a inibição da COX-2 é responsável pelos efeitos anti-inflamatórios e analgésicos. O diclofenaco potássico tem um início de ação mais rápido que o sódico, sendo preferível para dor aguda.",
        "Indicações": "Tratamento de dores agudas e crônicas de diversas origens (ex: dor pós-operatória, dor de dente, cólica menstrual, dor lombar, dor musculoesquelética), inflamação em condições como artrite reumatoide, osteoartrite, espondilite anquilosante, gota aguda, e também para o controle da febre (em algumas formulações e indicações específicas).",
        "Posologia": "Adultos: A dose varia amplamente de 50 mg a 150 mg por dia, divididos em 2 ou 3 doses, dependendo da formulação (comprimidos, cápsulas, gotas, injetáveis, supositórios, géis tópicos) e da condição a ser tratada. É crucial utilizar a menor dose eficaz pelo menor tempo possível para minimizar os riscos de efeitos adversos. Para dor aguda, o diclofenaco potássico pode ser administrado em doses de 25-50 mg a cada 6-8 horas.",
        "Contraindicações": "Hipersensibilidade conhecida ao diclofenaco, a outros AINEs (incluindo aspirina) ou a qualquer componente da fórmula; úlcera péptica ativa ou histórico de sangramento/perfuração gastrointestinal; insuficiência cardíaca grave; insuficiência hepática ou renal grave; gravidez (especialmente no terceiro trimestre, devido ao risco de fechamento prematuro do ducto arterioso fetal e disfunção renal fetal); asma, urticária ou rinite aguda precipitadas por AINEs; histórico de eventos tromboembólicos ou doença cardiovascular grave.",
        "Efeitos Colaterais": "Os efeitos mais comuns incluem distúrbios gastrointestinais, como dor epigástrica, náuseas, vômitos, diarreia, dispepsia, dor abdominal e flatulência. Efeitos mais graves incluem úlcera gastrointestinal, sangramento ou perfuração (que podem ser fatais, especialmente em idosos), eventos trombóticos cardiovasculares (infarto do miocárdio, acidente vascular cerebral), insuficiência renal aguda, elevação das enzimas hepáticas e reações cutâneas graves (ex: síndrome de Stevens-Johnson).",
        "Advertências e Precauções": "Devido ao risco de eventos gastrointestinais graves (sangramento, ulceração, perfuração), cardiovasculares (trombose, infarto do miocárdio, AVC) e renais (insuficiência renal aguda), o diclofenaco deve ser usado com extrema cautela. Pacientes com histórico de doenças gastrointestinais, cardíacas, renais ou hepáticas, bem como idosos, apresentam maior risco. Recomenda-se monitorar a função renal e hepática em tratamentos prolongados. Evitar em pacientes com desidratação grave. O uso concomitante com outros AINEs, anticoagulantes (ex: varfarina), antiagregantes plaquetários (ex: aspirina, clopidogrel) ou corticosteroides aumenta o risco de sangramento. Pode reduzir o efeito de diuréticos e anti-hipertensivos. Aconselha-se a menor dose e menor duração possíveis.",
        "Interações Medicamentosas": "O uso concomitante com outros AINEs, anticoagulantes (ex: varfarina), antiagregantes plaquetários (ex: aspirina, clopidogrel) ou corticosteroides aumenta o risco de sangramento. Pode reduzir o efeito de diuréticos e anti-hipertensivos."
    },
    {
        "Nome do Medicamento": "Nimesulida",
        "Princípio(s) Ativo(s)": ["Nimesulida"],
        "Classe Farmacológica": "Anti-inflamatório Não Esteroidal (AINE) com inibição preferencial da COX-2",
        "Mecanismo de Ação": "A nimesulida é um AINE que atua inibindo preferencialmente a enzima ciclooxigenase-2 (COX-2), responsável pela produção de prostaglandinas mediadoras da inflamação, dor e febre. Embora tenha alguma afinidade pela COX-1, sua seletividade pela COX-2 é maior do que a de AINEs não seletivos, o que, teoricamente, poderia reduzir o risco de efeitos adversos gastrointestinais, embora esse benefício seja controverso e os riscos hepáticos sejam uma preocupação particular.",
        "Indicações": "Tratamento de dores agudas (ex: dor de garganta, dor de dente, dores pós-operatórias, dismenorreia primária), inflamação (associada a condições como osteoartrite) e febre. É frequentemente utilizada para condições inflamatórias e dolorosas que requerem um efeito anti-inflamatório rápido.",
        "Posologia": "Adultos: A dose usual é de 100 mg, duas vezes ao dia. A duração do tratamento deve ser a mais curta possível e não deve exceder 15 dias, devido ao risco de hepatotoxicidade. A nimesulida deve ser administrada após as refeições para minimizar a irritação gástrica.",
        "Contraindicações": "Hipersensibilidade à nimesulida, a outros AINEs ou a qualquer componente da fórmula; úlcera péptica ativa ou histórico de sangramento/perfuração gastrointestinal; histórico de reações hepatotóxicas à nimesulida; insuficiência hepática (incluindo elevação de transaminases); insuficiência renal grave; insuficiência cardíaca grave; gravidez (terceiro trimestre) e lactação; crianças menores de 12 anos; uso concomitante de outras substâncias hepatotóxicas ou álcool em excesso.",
        "Efeitos Colaterais": "Os efeitos mais comuns incluem dor epigástrica, náuseas, vômitos, diarreia, rash cutâneo e prurido. O principal e mais grave efeito colateral associado à nimesulida é a hepatotoxicidade (lesão hepática), que pode variar de elevações assintomáticas de enzimas hepáticas a casos raros, mas graves, de insuficiência hepática aguda, por vezes fatal. Outros efeitos incluem sangramento gastrointestinal, reações alérgicas (incluindo anafilaxia) e, menos frequentemente, efeitos renais e cardiovasculares semelhantes a outros AINEs.",
        "Advertências e Precauções": "Devido ao risco significativo de hepatotoxicidade, a nimesulida deve ser utilizada com extrema cautela e sob estrita vigilância médica. É crucial que a duração do tratamento seja a mais curta possível e não exceda 15 dias. Pacientes devem ser instruídos a descontinuar o medicamento e procurar atendimento médico imediatamente se desenvolverem sintomas de disfunção hepática (ex: náuseas persistentes, vômitos, dor abdominal, fadiga, icterícia, urina escura). Evitar o uso concomitante com outros AINEs ou medicamentos hepatotóxicos. Usar com cautela em pacientes com histórico de doenças gastrointestinais, cardiovasculares, ou com alterações da coagulação. Monitorar a função hepática (transaminases) antes e durante o tratamento, se clinicamente indicado.",
        "Interações Medicamentosas": "Evitar o uso concomitante com outros AINEs ou medicamentos hepatotóxicos."
    },
    {
        "Nome do Medicamento": "Omeprazol",
        "Princípio(s) Ativo(s)": ["Omeprazol"],
        "Classe Farmacológica": "Inibidor da Bomba de Prótons (IBP)",
        "Mecanismo de Ação": "O omeprazol é um inibidor da bomba de prótons que atua de forma irreversível na H+/K+-ATPase (bomba de prótons) nas células parietais do estômago. Esta bomba é responsável pela etapa final da secreção de ácido gástrico. Ao inibir essa bomba, o omeprazol reduz significativamente a produção de ácido, independentemente do estímulo (alimentos, histamina, gastrina, acetilcolina), proporcionando um controle eficaz da acidez gástrica.",
        "Indicações": "Tratamento da doença do refluxo gastroesofágico (DRGE), incluindo esofagite de refluxo erosiva e não erosiva; cicatrização e prevenção de recidivas de úlceras gástricas e duodenais (incluindo úlceras associadas ao uso de AINEs); erradicação do *Helicobacter pylori* (em combinação com antibióticos apropriados); síndrome de Zollinger-Ellison (condição rara de hipersecreção ácida); e dispepsia funcional.",
        "Posologia": "Adultos: A dose usual varia de 20 mg a 40 mg, uma vez ao dia, geralmente pela manhã, antes da primeira refeição. Para erradicação de *H. pylori*, a dose é tipicamente de 20 mg duas vezes ao dia, em combinação com antibióticos, por 7 a 14 dias. A duração do tratamento varia conforme a indicação, sendo de 4 a 8 semanas para úlceras e DRGE, e uso contínuo para síndrome de Zollinger-Ellison.",
        "Contraindicações": "Hipersensibilidade conhecida ao omeprazol, a outros benzimidazóis substituídos (ex: pantoprazol, esomeprazol) ou a qualquer componente da fórmula; uso concomitante com nelfinavir (um antiviral) é contraindicado, pois o omeprazol pode reduzir significativamente a concentração plasmática do nelfinavir.",
        "Efeitos Colaterais": "Os efeitos mais comuns são geralmente leves e transitórios, incluindo cefaleia, dor abdominal, diarreia, náuseas, vômitos e flatulência. Efeitos menos comuns podem incluir tontura, erupções cutâneas, prurido, parestesias (sensação de formigamento) e boca seca. O uso prolongado (especialmente por mais de um ano) tem sido associado a um risco aumentado de fraturas ósseas (principalmente de quadril, punho e coluna), deficiência de vitamina B12 (devido à redução da absorção), hipomagnesemia (níveis baixos de magnésio no sangue), nefrite intersticial aguda e aumento do risco de infecções gastrointestinais (ex: *Clostridium difficile*).",
        "Advertências e Precauções": "Antes de iniciar o tratamento com omeprazol, é fundamental excluir a possibilidade de malignidade gástrica (câncer de estômago), pois o medicamento pode mascarar os sintomas. O uso prolongado (mais de um ano) requer monitoramento médico regular para avaliar os riscos potenciais, como deficiência de B12, hipomagnesemia e fraturas. Pacientes com DRGE crônica devem ter cautela ao interromper o tratamento, pois pode ocorrer 'rebote' ácido, com piora dos sintomas. Interações medicamentosas importantes incluem clopidogrel (o omeprazol pode reduzir a eficácia antiplaquetária), varfarina (potencial aumento do INR), metotrexato (aumento dos níveis de metotrexato) e medicamentos cuja absorção depende do pH gástrico (ex: cetoconazol, digoxina).",
        "Interações Medicamentosas": "Interações importantes incluem clopidogrel (o omeprazol pode reduzir a eficácia antiplaquetária), varfarina (potencial aumento do INR), metotrexato (aumento dos níveis de metotrexato) e medicamentos cuja absorção depende do pH gástrico (ex: cetoconazol, digoxina)."
    },
    {
        "Nome do Medicamento": "Pantoprazol",
        "Princípio(s) Ativo(s)": ["Pantoprazol Sódico Sesqui-hidratado"],
        "Classe Farmacológica": "Inibidor da Bomba de Prótons (IBP)",
        "Mecanismo de Ação": "O pantoprazol, assim como outros IBPs, é um inibidor seletivo e irreversível da H+/K+-ATPase (bomba de prótons) nas células parietais gástricas. Ele se liga covalentemente à bomba, inibindo a secreção de ácido clorídrico no lúmen gástrico. Sua ação é prolongada e independente do estímulo, proporcionando um controle eficaz da acidez gástrica e permitindo a cicatrização de lesões esofágicas e gástricas.",
        "Indicações": "Tratamento da doença do refluxo gastroesofágico (DRGE), incluindo esofagite de refluxo erosiva; cicatrização e prevenção de recidivas de úlceras gástricas e duodenais (incluindo úlceras induzidas por AINEs); erradicação do *Helicobacter pylori* (em combinação com antibióticos); síndrome de Zollinger-Ellison e outras condições de hipersecreção patológica.",
        "Posologia": "Adultos: A dose usual varia de 20 mg a 40 mg, uma vez ao dia, preferencialmente pela manhã, antes da primeira refeição. Para erradicação de *H. pylori*, a dose é tipicamente de 40 mg duas vezes ao dia, em combinação com antibióticos, por 7 a 14 dias. A duração do tratamento depende da indicação e da resposta clínica, variando de algumas semanas a uso contínuo em casos específicos.",
        "Contraindicações": "Hipersensibilidade conhecida ao pantoprazol, a outros benzimidazóis substituídos ou a qualquer componente da fórmula. O uso concomitante com nelfinavir (um antiviral) é contraindicado, devido ao risco de redução significativa da concentração plasmática do nelfinavir.",
        "Efeitos Colaterais": "Os efeitos mais comuns são geralmente leves e transitórios, incluindo cefaleia, dor abdominal superior, diarreia, constipação, náuseas, vômitos e flatulência. Efeitos menos comuns podem incluir tontura, urticária, boca seca e reações alérgicas. O uso prolongado (especialmente por mais de um ano) tem sido associado a um risco aumentado de fraturas ósseas, deficiência de vitamina B12 e hipomagnesemia. Há também um risco potencial, embora raro, de nefrite intersticial aguda e infecções por *Clostridium difficile*.",
        "Advertências e Precauções": "É crucial excluir a possibilidade de malignidade gástrica antes de iniciar o tratamento com pantoprazol, pois os sintomas podem ser mascarados. O uso prolongado (mais de um ano) requer monitoramento médico regular para avaliar os riscos potenciais associados, como deficiência de B12, hipomagnesemia e fraturas. O pantoprazol tem menos interações medicamentosas clinicamente significativas mediadas pelo CYP2C19 em comparação com omeprazol e esomeprazol, o que pode ser uma vantagem em pacientes que usam clopidogrel. No entanto, ainda deve-se ter cautela com medicamentos cuja absorção depende do pH gástrico e com metotrexato (risco de aumento dos níveis).",
        "Interações Medicamentosas": "O pantoprazol tem menos interações clinicamente significativas mediadas pelo CYP2C19 em comparação com omeprazol e esomeprazol. Deve-se ter cautela com medicamentos cuja absorção depende do pH gástrico e com metotrexato."
    },
    {
        "Nome do Medicamento": "Esomeprazol",
        "Princípio(s) Ativo(s)": ["Esomeprazol Magnésico", "Esomeprazol Sódico"],
        "Classe Farmacológica": "Inibidor da Bomba de Prótons (IBP)",
        "Mecanismo de Ação": "O esomeprazol é o S-enantiômero do omeprazol e atua como um inibidor seletivo e irreversível da H+/K+-ATPase (bomba de prótons) nas células parietais do estômago. Sua formulação como S-enantiômero confere-lhe uma maior biodisponibilidade e um perfil farmacocinético mais consistente em comparação com o omeprazol, resultando em uma inibição ácida mais potente e prolongada. Ele bloqueia a etapa final da produção de ácido, independentemente do estímulo.",
        "Indicações": "Tratamento da doença do refluxo gastroesofágico (DRGE), incluindo cicatrização de esofagite erosiva e manutenção da cicatrização para prevenir recidivas; tratamento sintomático da DRGE; cicatrização e prevenção de úlceras gástricas e duodenais (incluindo as associadas ao uso de AINEs); erradicação do *Helicobacter pylori* (em combinação com antibióticos); síndrome de Zollinger-Ellison e outras condições de hipersecreção patológica.",
        "Posologia": "Adultos: A dose usual varia de 20 mg a 40 mg, uma vez ao dia, preferencialmente pela manhã, pelo menos uma hora antes da refeição. Para erradicação de *H. pylori*, a dose é tipicamente de 20 mg ou 40 mg duas vezes ao dia, em combinação com antibióticos, por 7 a 14 dias. A duração do tratamento é determinada pela indicação e resposta clínica, variando de algumas semanas a uso contínuo em condições crônicas.",
        "Contraindicações": "Hipersensibilidade conhecida ao esomeprazol, a outros benzimidazóis substituídos ou a qualquer componente da fórmula. O uso concomitante com nelfinavir (um antiviral) é contraindicado, pois o esomeprazol pode reduzir significativamente a concentração plasmática do nelfinavir.",
        "Efeitos Colaterais": "Os efeitos mais comuns são geralmente leves e transitórios, incluindo cefaleia, dor abdominal, diarreia, náuseas, vômitos e flatulência. Efeitos menos comuns podem incluir tontura, boca seca, erupção cutânea e urticária. O uso prolongado (especialmente por mais de um ano) tem sido associado a um risco aumentado de fraturas ósseas (principalmente de quadril, punho e coluna), deficiência de vitamina B12 e hipomagnesemia. Há também um risco potencial, embora raro, de nefrite intersticial aguda e aumento do risco de infecções por *Clostridium difficile*.",
        "Advertências e Precauções": "É fundamental excluir a possibilidade de malignidade gástrica antes de iniciar o tratamento com esomeprazol, pois os sintomas podem ser mascarados. O uso prolongado (mais de um ano) requer monitoramento médico regular para avaliar os riscos potenciais associados, como deficiência de B12, hipomagnesemia e fraturas. Pacientes com DRGE crônica devem ter cautela ao interromper o tratamento, pois pode ocorrer 'rebote' ácido. O esomeprazol, assim como o omeprazol, pode interagir com o clopidogrel, reduzindo sua eficácia antiplaquetária, embora a relevância clínica dessa interação seja debatida e dependa da dose e duração. Outras interações importantes incluem varfarina (potencial aumento do INR), metotrexato (aumento dos níveis de metotrexato) e medicamentos cuja absorção depende do pH gástrico.",
        "Interações Medicamentosas": "O esomeprazol, assim como o omeprazol, pode interagir com o clopidogrel, reduzindo sua eficácia antiplaquetária. Outras interações importantes incluem varfarina (potencial aumento do INR), metotrexato (aumento dos níveis de metotrexato) e medicamentos cuja absorção depende do pH gástrico."
    }
];

// Mapeamento dos termos de busca do usuário para as chaves da interface MedicamentoBula
const infoTypeMap: { [key: string]: keyof MedicamentoBula } = {
    "classe terapeutica": "Classe Farmacológica",
    "posologia": "Posologia",
    "indicacoes": "Indicações",
    "efeitos colaterais": "Efeitos Colaterais",
    "contraindicacoes": "Contraindicações",
    "mecanismo de acao": "Mecanismo de Ação",
    "interacoes medicamentosas": "Interações Medicamentosas",
};

/**
 * Função para buscar informações específicas de um medicamento em nossa base de dados estática.
 *
 * @param drugName O nome do medicamento a ser buscado.
 * @param infoType O tipo de informação desejada (ex: "posologia", "efeitos colaterais", "tudo").
 * @returns Uma string contendo a informação solicitada ou uma mensagem de "não encontrado".
 */
export function getMedicamentoInfo(drugName: string, infoType: string): string {
    const termoBuscaMedicamento = drugName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const medicamentoEncontrado = medicamentosData.find(bula =>
        bula["Nome do Medicamento"].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(termoBuscaMedicamento)
    );

    if (!medicamentoEncontrado) {
        return `Não encontrei informações sobre o medicamento '${drugName}' em nossa base de dados.`;
    }

    // Caso o usuário peça por "tudo" ou "informações completas"
    if (infoType === "tudo") {
        let fullInfo = `Informações completas sobre **${medicamentoEncontrado["Nome do Medicamento"]}**:\n\n`;
        // Excluir "Nome do Medicamento" e "Advertências e Precauções" para evitar redundância e melhorar a leitura.
        const excludedKeys: Array<keyof MedicamentoBula> = ["Nome do Medicamento", "Advertências e Precauções"];

        for (const key in medicamentoEncontrado) {
            const typedKey = key as keyof MedicamentoBula;
            if (!excludedKeys.includes(typedKey)) {
                const value = medicamentoEncontrado[typedKey];
                fullInfo += `* **${key}:** ${Array.isArray(value) ? value.join(', ') : value}\n`;
            }
        }
        return fullInfo;
    }

    const mappedInfoType = infoTypeMap[infoType];

    if (!mappedInfoType) {
        // Se o tipo de informação solicitado não for mapeado
        return `Não tenho a informação específica sobre '${infoType}' para o medicamento '${medicamentoEncontrado["Nome do Medicamento"]}'. Por favor, tente termos como 'classe terapeutica', 'posologia', 'indicacoes', 'efeitos colaterais', 'contraindicacoes', 'mecanismo de acao', 'interacoes medicamentosas' ou 'tudo'.`;
    }

    const info = medicamentoEncontrado[mappedInfoType];

    if (info) {
        return `* **${mappedInfoType}** do medicamento **${medicamentoEncontrado["Nome do Medicamento"]}**: ${Array.isArray(info) ? info.join(', ') : info}`;
    } else {
        // Se o campo existe na interface mas está vazio no dado
        return `Não encontrei a informação de '${mappedInfoType}' para o medicamento '${medicamentoEncontrado["Nome do Medicamento"]}'.`;
    }
}