const PDFDocument = require('pdfkit');
const csv = require('csv-parse/sync');
const { parseCsvSafe } = require('./csvUtil');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');


// NOVO PDF GENERATOR: 100% CAMPOS OFICIAIS M 1-04-02
function generatePdf(csvData, prompt, predicaoLLM) {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const records = parseCsvSafe(csvData, { columns: true });
        const casoAtual = records && records.length ? records[records.length - 1] : {};

        // Função para obter campo oficial com fallback
        function get(field, fallback = 'N/D') {
          return casoAtual[field] && casoAtual[field].trim() ? casoAtual[field] : fallback;
        }

        // Parse da análise LLM para extrair dados dinâmicos
        function cleanMarkdown(text) {
          return text
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/#{1,6}\s/g, '')
            .replace(/TABLE[^\n]*/gi, '')
            .replace(/TITLE[^\n]*/gi, '')
            .replace(/\|[^|\n]*\|/g, '')
            .replace(/^[\-=_\s]+$/gm, '')
            .replace(/^\s*[\r\n]/gm, '\n')
            .trim();
        }

        function parseAnalysisData(analysisText) {
          // Retorna estrutura com previsão e recomendações mais detalhadas
          const defaultObj = {
            localizacaoContent: '',
            recomendacoesContent: '',
            zonasSugeridas: [], // [{ texto, probabilidade, coords }]
            taticas: [], // lista de táticas operacionais
            recursos: [], // recursos necessários (pessoas, veículos, cães, drones)
            janelaTemporal: '' // prioridade temporal / janela de busca
          };
          if (!analysisText || typeof analysisText !== 'string' || analysisText.trim().length === 0) return defaultObj;
          try {
            const cleanAnalysis = cleanMarkdown(analysisText);
            const paragraphs = cleanAnalysis.split('\n\n').map(p => p.trim()).filter(p => p.length > 0);
            // Heurísticas simples: procurar por títulos e linhas que contenham palavras-chave
            const zonas = [];
            const taticas = [];
            const recursos = [];
            let localizacaoLines = [], recomendacoesLines = [], janela = '';

            paragraphs.forEach(p => {
              const pl = p.toLowerCase();
              if (pl.includes('zona') || pl.includes('zona sugerida') || pl.includes('probabilidade') || pl.includes('coordenada') || pl.includes('lat') || pl.includes('lon')) {
                zonas.push(p);
              } else if (pl.includes('tática') || pl.includes('tactica') || pl.includes('tática') || pl.includes('tatica') || pl.includes('setor') || pl.includes('varredura') || pl.includes('perímetro')) {
                taticas.push(p);
              } else if (pl.includes('recurs') || pl.includes('equip') || pl.includes('drone') || pl.includes('canil') || pl.includes('viatura') || pl.includes('helicóptero')) {
                recursos.push(p);
              } else if (pl.includes('janela') || pl.includes('horas') || pl.includes('24h') || pl.includes('48h') || pl.includes('prioridade')) {
                janela = p;
              } else {
                // distribuir por localização ou recomendações segundo presença de palavras-chave
                if (pl.includes('previs') || pl.includes('localiz') || pl.includes('probabil')) localizacaoLines.push(p);
                else recomendacoesLines.push(p);
              }
            });

            // Montar conteúdos resumidos
            defaultObj.localizacaoContent = (localizacaoLines.length ? localizacaoLines.join('\n\n') : zonas.join('\n\n') || paragraphs.slice(0,2).join('\n\n'));
            defaultObj.recomendacoesContent = (recomendacoesLines.length ? recomendacoesLines.join('\n\n') : taticas.concat(recursos).slice(0,4).join('\n\n'));
            defaultObj.zonasSugeridas = zonas.slice(0,5).map(z => ({ texto: z }));
            defaultObj.taticas = taticas.slice(0,8);
            defaultObj.recursos = recursos.slice(0,8);
            defaultObj.janelaTemporal = janela || paragraphs.find(p => p.toLowerCase().includes('janela') || p.toLowerCase().includes('horas') || p.toLowerCase().includes('24h') || p.toLowerCase().includes('48h')) || '';
            return defaultObj;
          } catch (e) {
            defaultObj.localizacaoContent = analysisText.substring(0, 1200);
            defaultObj.recomendacoesContent = analysisText.substring(1200, 2400);
            return defaultObj;
          }
        }
        const analiseData = parseAnalysisData(predicaoLLM);

        // Helpers para obter mapas estáticos (OSM Static Map via staticmap.openstreetmap.de)
        function computeZoomForBuffer(meters) {
          if (!meters || meters <= 0) return 15;
          if (meters <= 250) return 16;
          if (meters <= 500) return 15;
          if (meters <= 1000) return 14;
          return 13;
        }

        async function fetchStaticMap(lat, lon, bufferMeters = 500, width = 800, height = 400) {
          if (!lat || !lon) return null;
          try {
            const zoom = computeZoomForBuffer(bufferMeters);
            const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${zoom}&size=${Math.min(1280, width)}x${Math.min(1280, height)}&markers=${lat},${lon},red-pushpin`;
            const res = await fetch(url, { timeout: 10000 });
            if (!res.ok) return null;
            const buf = await res.buffer();
            if (buf && buf.length > 100) return buf;
            return null;
          } catch (e) {
            return null;
          }
        }

        // Antes de criar o documento, tentar obter mapas se houver coordenadas
        let lat = null, lon = null;
        const latlonText = (casoAtual.Morada_Exacta_Coordenadas || casoAtual.Coordenadas || '').toString();
        if (latlonText && latlonText.includes(',')) {
          const parts = latlonText.split(',').map(s => s.trim());
          const a = parseFloat(parts[0]);
          const b = parseFloat(parts[1]);
          if (!isNaN(a) && !isNaN(b)) { lat = a; lon = b; }
        }

        let mapaUltimoAvistamento = null;
        if (lat && lon) {
          mapaUltimoAvistamento = await fetchStaticMap(lat, lon, 500, 1000, 600);
        }

        const doc = new PDFDocument({ 
          size: 'A4',
          margin: 50,
          info: {
            Title: 'Relatório Pessoa Desaparecida',
            Author: 'SARIA',
            Creator: 'Sistema AI',
            CreationDate: new Date()
          }
        });
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Design e helpers
        const pageWidth = doc.page.width - 100;
        const leftMargin = 50;
        const gnrGreen = '#1B5E20';
        function addPageNumber() {}
        function checkSpace(needed = 100) { if (doc.y > doc.page.height - 100 - needed) { doc.addPage(); return true; } return false; }
        function addChapterHeader(title, chapterNum = '') {
          checkSpace(80);
          doc.moveDown(1);
          const headerHeight = 40;
          const headerY = doc.y;
          doc.rect(leftMargin, headerY, pageWidth, headerHeight).fillAndStroke(gnrGreen, gnrGreen);
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#FFFFFF').text(`${chapterNum} ${title}`.trim().toUpperCase(), leftMargin + 15, headerY + 13, { width: pageWidth - 30, align: 'left' });
          doc.y = headerY + headerHeight + 15;
          doc.fillColor('#000000');
        }
        function addSubheader(title, level = 1) {
          checkSpace(40);
          doc.fontSize(level === 1 ? 12 : 11).font('Helvetica-Bold').fillColor(gnrGreen).text(title, leftMargin, doc.y, { width: pageWidth });
          doc.moveDown(0.5); doc.fillColor('#000000');
        }
        function addDataTable(data, title = '') {
          if (title) addSubheader(title);
          checkSpace(data.length * 30 + 50);
          const col1Width = 220, col2Width = pageWidth - col1Width; let currentY = doc.y;
          data.forEach((item, i) => {
            if (currentY > doc.page.height - 150) { doc.addPage(); currentY = 80; }
            const labelHeight = doc.heightOfString(item[0] + ':', { width: col1Width - 16 });
            const valueHeight = doc.heightOfString(item[1] || 'N/D', { width: col2Width - 16 });
            const itemHeight = Math.max(labelHeight + 12, valueHeight + 12, 25);
            const bgColor = i % 2 === 0 ? '#f8f9fa' : '#ffffff';
            doc.rect(leftMargin, currentY, pageWidth, itemHeight).fillAndStroke(bgColor, '#e9ecef');
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#495057').text(item[0] + ':', leftMargin + 8, currentY + 8, { width: col1Width - 16, height: itemHeight - 16 });
            doc.font('Helvetica').fillColor('#000000').text(item[1] || 'N/D', leftMargin + col1Width + 8, currentY + 8, { width: col2Width - 16, height: itemHeight - 16 });
            currentY += itemHeight;
          });
          doc.y = currentY + 15;
        }
        function addText(text, options = {}) {
          checkSpace(40);
          const cleanText = cleanMarkdown(text);
          doc.fontSize(options.fontSize || 10).font(options.font || 'Helvetica').fillColor(options.color || '#000000').text(cleanText, options.x || leftMargin, options.y || doc.y, { width: options.width || pageWidth, align: options.align || 'justify', lineGap: 2, indent: options.indent || 0 });
          doc.moveDown(options.spacing || 0.4);
        }

        // CAPA
        const logoPath = path.join(__dirname, '../logo_capa.png');
        let hasLogo = false;
        try { if (fs.existsSync(logoPath)) { const stats = fs.statSync(logoPath); if (stats.size > 0) hasLogo = true; } } catch (e) {}
        if (hasLogo) {
          try { const logoSize = 120, logoX = (doc.page.width - logoSize) / 2, logoY = 70; doc.image(logoPath, logoX, logoY, { width: logoSize, height: logoSize, fit: [logoSize, logoSize] }); doc.y = logoY + logoSize + 30; } catch (e) { doc.y = 180; }
        } else { doc.y = 180; }
        doc.fontSize(22).font('Helvetica-Bold').fillColor(gnrGreen).text('NACIONAL REPUBLICANA', { align: 'center' });
        doc.fontSize(16).fillColor('#000000').text('UNIDADE DE EMERGÊNCIA PROTEÇÃO E SOCORRO', { align: 'center' });
        doc.moveDown(3);
        doc.fontSize(20).font('Helvetica-Bold').fillColor(gnrGreen).text('RELATÓRIO OFICIAL', { align: 'center' }).text('PESSOA DESAPARECIDA', { align: 'center' });
        doc.moveDown(2);
        doc.fontSize(14).fillColor('#000000').font('Helvetica-Bold').text(`Caso: ${get('Nome_Completo')}`, { align: 'center' });
        doc.fontSize(12).font('Helvetica').text(`Desaparecimento: ${get('Data_Desaparecimento')} às ${get('Hora_Desaparecimento')}`, { align: 'center' }).text(`Local: ${get('Local_Ultimo_Avistamento')}`, { align: 'center' }).text(`Concelho: ${get('Concelho')}`, { align: 'center' });
        const rodapeY = doc.page.height - 150; doc.y = rodapeY;
        doc.fontSize(10).fillColor('#666666').text('DOCUMENTO CONFIDENCIAL', { align: 'center' }).text('USO INTERNO', { align: 'center' });
        doc.moveDown(1);
        doc.fontSize(10).fillColor('#000000').text(`Gerado automaticamente pelo Sistema`, { align: 'center' }).text(`${new Date().toLocaleString('pt-PT')}`, { align: 'center' });
        addPageNumber();

        // CONTRA-CAPA
        doc.addPage(); addPageNumber();
        doc.fontSize(12).font('Helvetica-Bold').fillColor(gnrGreen).text('AVISO LEGAL E CONFIDENCIALIDADE', { align: 'center' });
        doc.moveDown(1); doc.fillColor('#000000');
        addText('Este relatório contém informações confidenciais e destina-se exclusivamente a uso interno no âmbito de operações de busca e salvamento.');
        addText('A divulgação, reprodução ou utilização não autorizada do conteúdo deste documento é estritamente proibida e pode constituir crime nos termos da legislação em vigor.');
        doc.moveDown(1);
        addText('RESPONSABILIDADE:', { font: 'Helvetica-Bold' });
        addText('As previsões e recomendações apresentadas baseiam-se em análise automatizada de dados e devem ser sempre validadas pelo comando operacional antes da implementação.');

        // CAPÍTULO 1 - DADOS DO DENUNCIANTE
        doc.addPage(); addPageNumber();
        addChapterHeader('DADOS DO DENUNCIANTE', 'CAPÍTULO 1 -');
        addDataTable([
          ['Nome', get('Denunciante_Nome')],
          ['Relação', get('Denunciante_Relacao')],
          ['Contacto', get('Denunciante_Contacto')],
          ['Data da Denúncia', get('Data_Denuncia')],
          ['Disponibilidade', get('Denunciante_Disponibilidade')],
          ['Endereço', get('Denunciante_Endereco')]
        ], '1.1 Dados do Denunciante');

        // CAPÍTULO 2 - IDENTIFICAÇÃO PESSOAL
        doc.addPage(); addPageNumber();
        addChapterHeader('IDENTIFICAÇÃO PESSOAL', 'CAPÍTULO 2 -');
        addDataTable([
          ['Nome Completo', get('Nome_Completo')],
          ['Idade', `${get('Idade_Exacta')} anos`],
          ['Sexo', get('Sexo')],
          ['Nacionalidade', get('Nacionalidade')],
          ['Estado Civil', get('Estado_Civil')],
          ['Filhos', get('Numero_Filhos')],
          ['Línguas Faladas', get('Linguas_Faladas')],
          ['Profissão', get('Profissao')],
          ['Morada Habitual', get('Endereco_Domicilio_Habitual')]
        ], '2.1 Dados Pessoais');

        // CAPÍTULO 3 - LOCAL E CIRCUNSTÂNCIAS
        doc.addPage(); addPageNumber();
        addChapterHeader('LOCAL E CIRCUNSTÂNCIAS', 'CAPÍTULO 3 -');
        addDataTable([
          ['Data do Desaparecimento', get('Data_Desaparecimento')],
          ['Hora do Desaparecimento', get('Hora_Desaparecimento')],
          ['Local Último Avistamento', get('Local_Ultimo_Avistamento')],
          ['Tipo de Local', get('Tipo_Local')],
          ['Coordenadas', get('Morada_Exacta_Coordenadas')],
          ['Domicílio Habitual', get('Endereco_Domicilio_Habitual')],
          ['Tipo de Terreno', get('Tipo_Terreno')],
          ['Concelho', get('Concelho')],
          ['Freguesia', get('Freguesia')],
          ['Condições Meteorológicas', get('Condicoes_Meteorologicas')]
        ], '3.1 Local e Circunstâncias');

        // Inserir mapa se disponível
        if (mapaUltimoAvistamento) {
          try {
            addSubheader('Mapa: Último Avistamento', 2);
            checkSpace(240);
            doc.image(mapaUltimoAvistamento, { fit: [pageWidth, 220], align: 'center' });
            doc.moveDown(1);
          } catch (e) {
            addSubheader('Mapa: Último Avistamento', 2);
            addText('Mapa indisponível (erro ao inserir imagem).');
          }
        } else {
          addSubheader('Mapa: Último Avistamento', 2);
          addText('Mapa indisponível.');
        }

        // CAPÍTULO X - PESSOA ENCONTRADA (incluir se houver campos relativos a encontrado)
        try {
          const hasEncontrado = (casoAtual.Data_Encontrado && casoAtual.Data_Encontrado.trim()) || (casoAtual.Latitude_Encontrado && casoAtual.Latitude_Encontrado.toString().trim()) || (casoAtual.Longitude_Encontrado && casoAtual.Longitude_Encontrado.toString().trim());
          if (hasEncontrado) {
            doc.addPage(); addPageNumber();
            addChapterHeader('PESSOA ENCONTRADA', '');
            // Tabela resumida com os campos principais de encontrado
            addDataTable([
              ['Data', get('Data_Encontrado')],
              ['Hora', get('Hora_Encontrado')],
              ['Local (rua)', get('Local_Encontrado')],
              ['Freguesia', get('Freguesia_Encontrado')],
              ['Concelho', get('Concelho_Encontrado')],
              ['Latitude', get('Latitude_Encontrado')],
              ['Longitude', get('Longitude_Encontrado')],
              ['Estado da pessoa', get('Estado_Pessoa_Encontrado')],
              ['Meios accionados', get('Meios_Accionados')],
              ['Quem encontrou', get('Quem_Encontrou')],
              ['Nome de quem encontrou', get('Nome_Quem_Encontrou')],
              ['Contacto de quem encontrou', get('Contacto_Quem_Encontrou')],
              ['Distância (km)', get('Distancia_km_Encontrado')],
              ['Marcador / Audit trail', get('Encontrado_Marcador')],
              ['Data/Hora marcação', get('Encontrado_DataHora_Marcacao')]
            ], 'Dados do registo de encontro');

            // Inserir mapa do local onde foi encontrada, se houver coordenadas
            const latF = casoAtual.Latitude_Encontrado || casoAtual.LatitudeEncontrado || casoAtual.latEncontrado || casoAtual.lat;
            const lonF = casoAtual.Longitude_Encontrado || casoAtual.LongitudeEncontrado || casoAtual.lonEncontrado || casoAtual.lon;
            if (latF && lonF) {
              try {
                const mapaEncontrado = await fetchStaticMap(latF, lonF, 500, 1000, 400);
                if (mapaEncontrado) {
                  addSubheader('Mapa: Local onde foi encontrada', 2);
                  checkSpace(240);
                  doc.image(mapaEncontrado, { fit: [pageWidth, 220], align: 'center' });
                  doc.moveDown(1);
                }
              } catch (e) {
                // falha silenciosa: não bloquear geração do PDF
                debugLogger && debugLogger.warn && debugLogger.warn('Não foi possível obter mapa do local encontrado', e.message || e);
              }
            }
          }
        } catch (e) {
          // proteger contra qualquer erro nesta secção
          debugLogger && debugLogger.warn && debugLogger.warn('Erro ao inserir secção Pessoa Encontrada no PDF', e.message || e);
        }

        // CAPÍTULO 4 - DESCRIÇÃO FÍSICA
        doc.addPage(); addPageNumber();
        addChapterHeader('DESCRIÇÃO FÍSICA', 'CAPÍTULO 4 -');
        addDataTable([
          ['Altura', `${get('Altura')} cm`],
          ['Peso', `${get('Peso')} kg`],
          ['Compleição', get('Compleicao_Fisica')],
          ['Cabelos', `${get('Cor_Cabelos')} (${get('Comprimento_Cabelos')})`],
          ['Olhos', get('Cor_Olhos')],
          ['Elementos Distintivos', get('Elementos_Distintivos')],
          ['Vestuário', `${get('Roupa_Superior')} / ${get('Roupa_Inferior')} / ${get('Casaco_Agasalho')}`],
          ['Calçado', get('Calcado')],
          ['Acessórios', get('Acessorios')]
        ], '4.1 Características Físicas');

        // CAPÍTULO 5 - SAÚDE E VULNERABILIDADES
        doc.addPage(); addPageNumber();
        addChapterHeader('SAÚDE E VULNERABILIDADES', 'CAPÍTULO 5 -');
        addDataTable([
          ['Incapacidade Cognitiva', get('Possui_Incapacidade_Cognitiva')],
          ['Anomalias Psíquicas', get('Possui_Anomalia_Psiquica')],
          ['Perturbações Mentais', get('Possui_Perturbacoes_Mentais')],
          ['Doenças Neurodegenerativas', get('Possui_Doencas_Neurodegenerativas')],
          ['Doenças Crónicas', get('Possui_Doencas_Cronicas')],
          ['Falta de Autonomia', get('Falta_Autonomia')],
          ['Medicamentos Vitais', get('Medicamentos_Vitais_Necessarios')],
          ['Transporta Medicação', get('Transporta_Medicamentos')]
        ], '5.1 Saúde e Vulnerabilidades');

        // CAPÍTULO 6 - CONTACTOS E COMUNICAÇÕES
        doc.addPage(); addPageNumber();
        addChapterHeader('CONTACTOS E COMUNICAÇÕES', 'CAPÍTULO 6 -');
        addDataTable([
          ['Telefone Principal', get('Telefone_Principal')],
          ['Telemóvel', get('Telemovel_Principal')],
          ['Operador', get('Operador_Rede')],
          ['Emails', get('Contas_Email')],
          ['Redes Sociais', get('Perfis_Redes_Sociais')]
        ], '6.1 Contactos e Comunicações');

        // CAPÍTULO 7 - VEÍCULOS
        doc.addPage(); addPageNumber();
        addChapterHeader('VEÍCULOS', 'CAPÍTULO 7 -');
        addDataTable([
          ['Utilizou Veículo', get('Utilizou_Veiculo')],
          ['Tipo', get('Tipo_Veiculo')],
          ['Marca/Modelo', `${get('Marca_Veiculo')} ${get('Modelo_Veiculo')}`],
          ['Cor', get('Cor_Veiculo')],
          ['Matrícula', get('Matricula_Veiculo')]
        ], '7.1 Veículos');

        // CAPÍTULO 8 - AVALIAÇÃO DE RISCO OFICIAL
        doc.addPage(); addPageNumber();
        addChapterHeader('AVALIAÇÃO DE RISCO OFICIAL', 'CAPÍTULO 8 -');
        addDataTable([
          ['Nível de Risco', get('Risco_Calculado')],
          ['Prioridade', get('Avaliacao_Prioridade')],
          ['Indicadores Ativos', get('Indicadores_Risco_Activos')],
          ['Tipo de Desaparecimento', get('Tipo_Desaparecimento')]
        ], '8.1 Avaliação de Risco Oficial');

        // (continua com restante conteúdo tal como antes)
        // Para manter o patch focado, reaproveitamos o resto do fluxo original abaixo sem alterações significativas
        // CAPÍTULO 9 - DEPENDÊNCIAS E VÍCIOS
        doc.addPage(); addPageNumber();
        addChapterHeader('DEPENDÊNCIAS E VÍCIOS', 'CAPÍTULO 9 -');
        addDataTable([
          ['Consome Álcool', get('Consome_Alcool')],
          ['Consome Drogas', get('Consome_Drogas')],
          ['Vício do Jogo', get('Vicio_Jogo')]
        ], '9.1 Dependências e Vícios');

        // CAPÍTULO 10 - ANTECEDENTES
        doc.addPage(); addPageNumber();
        addChapterHeader('ANTECEDENTES', 'CAPÍTULO 10 -');
        addDataTable([
          ['Reincidente', get('Reincidente_Desaparecimentos')],
          ['Vezes Anterior', get('Quantas_Vezes_Anterior')],
          ['Antecedentes Policiais', get('Antecedentes_Policiais')]
        ], '10.1 Antecedentes');

        // CAPÍTULO 11 - INDÍCIOS DE VOLUNTARIEDADE
        doc.addPage(); addPageNumber();
        addChapterHeader('INDÍCIOS DE VOLUNTARIEDADE', 'CAPÍTULO 11 -');
        addDataTable([
          ['Manifestou Intenção de Partir', get('Manifestou_Intencao_Partir')],
          ['Deixou Nota', get('Deixou_Nota_Despedida')],
          ['Verbalizou Intenção Suicida', get('Verbalizou_Intencao_Suicidio')],
          ['Tentativas Anteriores', get('Tentou_Suicidio_Anteriormente')]
        ], '11.1 Indícios de Voluntariedade');

        // CAPÍTULO 12 - OBSERVAÇÕES
        doc.addPage(); addPageNumber();
        addChapterHeader('OBSERVAÇÕES', 'CAPÍTULO 12 -');
        addText(get('Observacoes_Adicionais'));

        // CAPÍTULO 13 - SÍNTESE E RECOMENDAÇÕES
        doc.addPage(); addPageNumber();
        addChapterHeader('SÍNTESE E RECOMENDAÇÕES', 'CAPÍTULO 13 -');
        addSubheader('13.1 Previsão de Localização');
        if (analiseData.zonasSugeridas && analiseData.zonasSugeridas.length) {
          analiseData.zonasSugeridas.forEach((z, idx) => {
            addSubheader(`Zona sugerida ${idx + 1}`, 2);
            addText(z.texto || z);
          });
        } else if (analiseData.localizacaoContent && analiseData.localizacaoContent.length > 20) {
          addText(analiseData.localizacaoContent);
        } else { addText('Sem previsão detalhada disponível.'); }

        // Adicionar meta-informação estruturada: janela temporal e probabilidade geral
        // Função utilitária para desenhar uma tabela profissional (duas colunas: Ação | Prazo)
        function drawTwoColumnTable(rows, options = {}) {
          const colGap = 12;
          const col1Width = Math.round(pageWidth * 0.65);
          const col2Width = pageWidth - col1Width - colGap;
          const startX = leftMargin;
          let y = doc.y;

          // Cabeçalho da tabela
          const headerHeight = 22;
          doc.rect(startX, y, pageWidth, headerHeight).fillAndStroke('#e9f6ee', '#d2e9da');
          doc.fontSize(10).font('Helvetica-Bold').fillColor(gnrGreen).text(options.col1Title || 'Ação', startX + 8, y + 6, { width: col1Width - 16 });
          doc.fontSize(10).font('Helvetica-Bold').fillColor(gnrGreen).text(options.col2Title || 'Frequência / Prazo', startX + col1Width + colGap + 8, y + 6, { width: col2Width - 16 });
          y += headerHeight;

          rows.forEach((r, idx) => {
            const actionText = (r[0] || '').toString();
            const prazoText = (r[1] || '').toString();

            // calcular altura necessária para a linha
            const lh1 = doc.heightOfString(actionText, { width: col1Width - 16, align: 'left' });
            const lh2 = doc.heightOfString(prazoText, { width: col2Width - 16, align: 'left' });
            const rowHeight = Math.max(lh1, lh2) + 12;

            if (y + rowHeight > doc.page.height - 80) { doc.addPage(); y = doc.y; }

            const bg = idx % 2 === 0 ? '#ffffff' : '#f7f9f7';
            doc.rect(startX, y, pageWidth, rowHeight).fillAndStroke(bg, '#e6ece6');

            doc.fontSize(10).font('Helvetica').fillColor('#222222').text(actionText, startX + 8, y + 6, { width: col1Width - 16, align: 'left' });
            doc.fontSize(10).font('Helvetica').fillColor('#222222').text(prazoText, startX + col1Width + colGap + 8, y + 6, { width: col2Width - 16, align: 'left' });

            y += rowHeight;
          });

          doc.y = y + 12;
        }

        if (analiseData.janelaTemporal && analiseData.janelaTemporal.length) {
          addSubheader('Janela temporal / Prioridade', 2);
          // tentar interpretar a janelaTemporal como listas separadas por linhas ou por marcadores
          const lines = analiseData.janelaTemporal.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0);
          const rows = [];
          lines.forEach(line => {
            // tentar separar por ' - ', ':' ou ' Dentro de '
            let parts = [line, ''];
            if (line.includes('|')) parts = line.split('|').map(s => s.trim());
            else if (line.includes(' - ')) parts = line.split(' - ').map(s => s.trim());
            else if (line.includes(':')) parts = line.split(':').map(s => s.trim());
            else if (line.match(/\bDentro de\b/i)) {
              const m = line.match(/(.*)\b(Dentro de.*)/i);
              if (m) parts = [m[1].trim(), m[2].trim()];
            }
            rows.push([parts[0], parts[1] || '']);
          });
          if (rows.length === 0) rows.push([analiseData.janelaTemporal, '']);
          drawTwoColumnTable(rows, { col1Title: 'Ação', col2Title: 'Frequência / Prazo' });
        }

        addSubheader('13.2 Recomendações Operacionais');
        // Táticas sugeridas (formatar também como tabela para clareza)
        if (analiseData.taticas && analiseData.taticas.length) {
          addSubheader('Táticas sugeridas', 2);
          // cada tática pode vir com um prazo; tentar parse simples
          const rows = analiseData.taticas.map(t => {
            let texto = t || '';
            // procurar padrões de prazo 'Dentro de X' ou 'Dentro de X horas' ou '/horas'
            const prazoMatch = texto.match(/(Dentro de[^,;|\n]*)/i) || texto.match(/(\b\d+\s*(horas|hora|h)\b)/i);
            let prazo = '';
            if (prazoMatch) {
              prazo = prazoMatch[0].trim();
              texto = texto.replace(prazoMatch[0], '').replace(/[\-|:|\|]$/g, '').trim();
            }
            // se não houver prazo, tentar extrair algo no final após '|'
            if (!prazo && texto.includes('|')) {
              const parts = texto.split('|').map(s => s.trim());
              texto = parts[0]; prazo = parts[1] || '';
            }
            return [texto, prazo];
          });
          drawTwoColumnTable(rows, { col1Title: 'Tática / Ação', col2Title: 'Frequência / Prazo' });
        }
        // Recursos necessários
        if (analiseData.recursos && analiseData.recursos.length) {
          addSubheader('Recursos recomendados', 2);
          analiseData.recursos.forEach(r => addText('• ' + r));
        }
        // Recomendações livres
        if (analiseData.recomendacoesContent && analiseData.recomendacoesContent.length > 20) {
          addSubheader('Detalhes operacionais adicionais', 2);
          addText(analiseData.recomendacoesContent);
        }

        // Numeração de páginas (exceto capa)
        const pageRange = doc.bufferedPageRange();
        const totalPages = pageRange.count;
        for (let pageIndex = 1; pageIndex < totalPages; pageIndex++) {
          try {
            doc.switchToPage(pageIndex);
            doc.fontSize(9).font('Helvetica').fillColor('#666666').text((pageIndex + 1).toString(), doc.page.width - 70, doc.page.height - 40, { width: 30, align: 'right' });
          } catch (switchError) {}
        }
        try { doc.switchToPage(totalPages - 1); } catch (e) {}
        checkSpace(80); doc.moveDown(3);
        doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).strokeColor('#cccccc').stroke();
        doc.moveDown(1);
        doc.fontSize(8).font('Helvetica').fillColor('#666666').text('DOCUMENTO CONFIDENCIAL', { align: 'center' }).text(`Sistema AI - SARIA | ${new Date().toLocaleString('pt-PT')}`, { align: 'center' });
        doc.end();
      } catch (error) {
        reject(error);
      }
    })();
  });
}

module.exports = { generatePdf };
