const Groq = require('groq-sdk');
const crypto = require('crypto');
const { DebugLogger } = require('./debugLogger');
const { validateAnalysisResponse } = require('./ai/analysisValidator');
const { extractDataPacketFromPrompt } = require('./ai/promptPacketBuilder');

function hashText(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

class LLMService {
    constructor() {
        this.groq = process.env.GROQ_API_KEY
            ? new Groq({ apiKey: process.env.GROQ_API_KEY })
            : null;

        this.debugLogger = new DebugLogger();
        
        this.config = {
            model: "openai/gpt-oss-120b",
            temperature: 0.1,
            max_tokens: 8192,
            reasoning_effort: "high"
        };

        console.log('🤖 LLMService inicializado com GPT-o1');
        this.debugLogger.log('LLMService inicializado', {
            model: this.config.model,
            temperature: this.config.temperature,
            max_tokens: this.config.max_tokens,
            reasoning_effort: this.config.reasoning_effort,
            hasApiKey: !!process.env.GROQ_API_KEY
        });
    }

    async testarConexao() {
        try {
            this.debugLogger.section('TESTE DE CONEXÃO DETALHADO');
            if (!this.groq) {
                return {
                    success: false,
                    message: 'GROQ_API_KEY não configurada',
                    debug: { model: this.config.model, hasApiKey: false }
                };
            }
            
            this.debugLogger.log('Configuração do modelo', {
                model: this.config.model,
                apiKey: process.env.GROQ_API_KEY ? `${process.env.GROQ_API_KEY.slice(0, 3)}...${process.env.GROQ_API_KEY.slice(-4)}` : 'NÃO CONFIGURADA',
                baseUrl: 'https://api.groq.com',
                temperature: this.config.temperature,
                max_tokens: this.config.max_tokens,
                reasoning_effort: this.config.reasoning_effort
            });

            const testPrompt = "Teste de conexão: Responda apenas 'Conexão estabelecida com sucesso'";
            
            this.debugLogger.log('Enviando request para API', {
                prompt: testPrompt,
                promptLength: testPrompt.length,
                timestamp: new Date().toISOString()
            });

            console.log('📡 Enviando request para API...');
            const startTime = Date.now();
            
            const completion = await this.groq.chat.completions.create({
                messages: [{ role: "user", content: testPrompt }],
                model: this.config.model,
                temperature: this.config.temperature,
                max_tokens: this.config.max_tokens,
                reasoning_effort: this.config.reasoning_effort
            });

            const responseTime = Date.now() - startTime;
            console.log(`⏱️ Tempo de resposta: ${responseTime}ms`);

            this.debugLogger.log('Resposta recebida', {
                responseTime: `${responseTime}ms`,
                responseStructure: Object.keys(completion || {}),
                timestamp: new Date().toISOString()
            });

            console.log('📊 === ANÁLISE DA RESPOSTA ===');
            console.log('📋 Resposta completa da API:');
            console.log(JSON.stringify(completion, null, 2));

            this.debugLogger.log('Resposta completa da API', completion);

            console.log('🔍 Verificando estrutura...');
            console.log('📦 Tipo da resposta:', typeof completion);
            console.log('📂 Propriedades disponíveis:', Object.keys(completion));

            this.debugLogger.log('Análise da estrutura', {
                responseType: typeof completion,
                properties: Object.keys(completion),
                hasChoices: !!completion.choices,
                choicesCount: completion.choices?.length || 0
            });

            if (completion.choices && completion.choices.length > 0) {
                console.log('📊 Número de choices:', completion.choices.length);
                console.log('🎯 Primeira escolha:');
                console.log('📂 Propriedades:', Object.keys(completion.choices[0]));
                console.log('📝 Conteúdo completo:', JSON.stringify(completion.choices[0], null, 2));

                const choice = completion.choices[0];
                this.debugLogger.log('Primeira escolha', choice);

                if (choice.message) {
                    console.log('💬 Análise da mensagem:');
                    console.log('📂 Propriedades da mensagem:', Object.keys(choice.message));
                    console.log('📄 Mensagem completa:', JSON.stringify(choice.message, null, 2));
                    
                    const content = choice.message.content;
                    console.log('📝 Conteúdo:', JSON.stringify(content));
                    console.log('📏 Tipo do conteúdo:', typeof content);
                    console.log('📐 Tamanho:', content?.length);

                    this.debugLogger.log('Análise da mensagem', {
                        messageProperties: Object.keys(choice.message),
                        content: content,
                        contentType: typeof content,
                        contentLength: content?.length,
                        hasReasoning: !!choice.message.reasoning,
                        reasoning: choice.message.reasoning
                    });

                    if (!content || content.trim() === '') {
                        console.log('⚠️ AVISO: Conteúdo está null/undefined');
                        this.debugLogger.warn('Conteúdo vazio ou null', {
                            content,
                            reasoning: choice.message.reasoning,
                            finishReason: choice.finish_reason
                        });

                        if (choice.message.reasoning) {
                            console.log('🧠 Reasoning presente:', choice.message.reasoning);
                            return {
                                success: true,
                                message: 'Conexão estabelecida - reasoning model ativo',
                                response: choice.message.reasoning,
                                debug: {
                                    model: this.config.model,
                                    responseTime,
                                    hasReasoning: true,
                                    finishReason: choice.finish_reason
                                }
                            };
                        }
                    } else {
                        this.debugLogger.success('Teste de conexão bem-sucedido', {
                            response: content,
                            responseTime,
                            model: this.config.model
                        });

                        return {
                            success: true,
                            message: 'Conexão estabelecida com sucesso',
                            response: content,
                            debug: {
                                model: this.config.model,
                                responseTime,
                                hasReasoning: !!choice.message.reasoning,
                                finishReason: choice.finish_reason
                            }
                        };
                    }
                }
            }

            this.debugLogger.error('Estrutura de resposta inválida', {
                completion,
                hasChoices: !!completion.choices,
                choicesLength: completion.choices?.length
            });

            return {
                success: false,
                message: 'Resposta da API inválida - estrutura não reconhecida',
                debug: completion
            };

        } catch (error) {
            console.log('❌ Erro na conexão:', error.message);
            
            this.debugLogger.error('Erro na conexão com API', {
                message: error.message,
                name: error.name,
                stack: error.stack,
                response: error.response?.data
            });

            return {
                success: false,
                message: `Erro na conexão: ${error.message}`,
                error
            };
        }
    }

    async gerarPredicao(caseData, historicoCasos) {
        try {
            this.debugLogger.section('INÍCIO DA ANÁLISE LLM');
            if (!this.groq) {
                return {
                    success: false,
                    error: 'GROQ_API_KEY não configurada',
                    debug: { model: this.config.model, hasApiKey: false }
                };
            }
            
            console.log('🔍 Iniciando análise do último caso...');
            console.log('🤖 Iniciando análise com GPT-o1 (reasoning model)...');
            console.log('📊 Modelo:', this.config.model);
            console.log('🧠 Reasoning Effort:', this.config.reasoning_effort);

            this.debugLogger.log('Iniciando análise', {
                model: this.config.model,
                reasoning_effort: this.config.reasoning_effort,
                temperature: this.config.temperature,
                max_tokens: this.config.max_tokens,
                caseData: typeof caseData,
                historicoCasos: Array.isArray(historicoCasos) ? historicoCasos.length : typeof historicoCasos
            });

            let prompt;
            let messages = null;
            let dataPacket = null;
            let promptVersion = 'legacy';
            
            if (caseData && typeof caseData === 'object' && (caseData.prompt || caseData.messages)) {
                prompt = caseData.prompt || (caseData.messages || []).map(message => message.content).join('\n\n');
                messages = Array.isArray(caseData.messages) ? caseData.messages : [{ role: 'user', content: prompt }];
                dataPacket = caseData.dataPacket || extractDataPacketFromPrompt(prompt);
                promptVersion = caseData.promptVersion || dataPacket?.prompt_version || 'structured';
                this.debugLogger.log('Usando pacote de prompt estruturado', {
                    promptLength: prompt.length,
                    promptVersion,
                    hasDataPacket: !!dataPacket
                });
            } else if (typeof caseData === 'string') {
                prompt = caseData;
                dataPacket = extractDataPacketFromPrompt(prompt);
                promptVersion = dataPacket?.prompt_version || 'prebuilt';
                if (dataPacket) {
                    messages = [
                        { role: 'system', content: 'Respeita rigorosamente os guardrails e o contrato JSON incluídos no prompt do utilizador.' },
                        { role: 'user', content: prompt }
                    ];
                }
                this.debugLogger.log('Usando prompt pré-construído', {
                    promptLength: prompt.length,
                    source: 'buildPrompt',
                    promptVersion,
                    hasDataPacket: !!dataPacket
                });
            } else {
                const PromptBuilder = require('./promptBuilder');
                if (typeof PromptBuilder.buildPromptPackage === 'function') {
                    const promptPackage = PromptBuilder.buildPromptPackage(caseData, historicoCasos);
                    prompt = promptPackage.prompt;
                    messages = promptPackage.messages;
                    dataPacket = promptPackage.dataPacket;
                    promptVersion = promptPackage.promptVersion || dataPacket?.prompt_version || 'structured';
                } else {
                    prompt = PromptBuilder.buildPrompt(caseData, historicoCasos);
                    dataPacket = extractDataPacketFromPrompt(prompt);
                    promptVersion = dataPacket?.prompt_version || 'legacy';
                }
                this.debugLogger.log('Construindo prompt dinamicamente', {
                    caseDataType: typeof caseData,
                    historicoCasosLength: historicoCasos?.length || 0,
                    promptVersion,
                    hasDataPacket: !!dataPacket
                });
            }
            
            console.log('📝 Tamanho do prompt:', prompt.length, 'caracteres');
            const promptHash = hashText(prompt);
            
            this.debugLogger.log('Prompt construído', {
                promptLength: prompt.length,
                promptHash,
                promptVersion,
                hasDataPacket: !!dataPacket,
                promptPreview: prompt.substring(0, 500) + '...',
                fullPrompt: process.env.LLM_DEBUG_FULL_PROMPT === 'true' ? prompt : '[redigido: defina LLM_DEBUG_FULL_PROMPT=true apenas em ambiente controlado]'
            });

            const startTime = Date.now();

            this.debugLogger.log('Enviando request para Groq API', {
                timestamp: new Date().toISOString(),
                model: this.config.model,
                temperature: this.config.temperature,
                max_tokens: this.config.max_tokens,
                reasoning_effort: this.config.reasoning_effort
            });

            const completion = await this.groq.chat.completions.create({
                messages: messages || [{ role: "user", content: prompt }],
                model: this.config.model,
                temperature: this.config.temperature,
                max_tokens: this.config.max_tokens,
                reasoning_effort: this.config.reasoning_effort
            });

            const responseTime = Date.now() - startTime;

            console.log('📊 Resposta da API recebida:', JSON.stringify({
                id: completion?.id,
                model: completion?.model,
                choices: completion?.choices?.length || 0,
                usage: completion?.usage || null
            }, null, 2));

            this.debugLogger.log('Resposta completa da API', {
                completion: {
                    id: completion?.id,
                    model: completion?.model,
                    choices: completion?.choices?.length || 0,
                    usage: completion?.usage || null
                },
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString()
            });

            if (!completion || !completion.choices || completion.choices.length === 0) {
                const errorMsg = 'Resposta inválida da API - sem choices';
                console.log('❌', errorMsg);
                this.debugLogger.error(errorMsg, { completion });
                throw new Error(errorMsg);
            }

            const choice = completion.choices[0];
            
            this.debugLogger.log('Primeira escolha da API', {
                choice,
                hasMessage: !!choice.message,
                finishReason: choice.finish_reason
            });

            if (!choice.message) {
                const errorMsg = 'Resposta inválida - sem message';
                console.log('❌', errorMsg);
                this.debugLogger.error(errorMsg, { choice });
                throw new Error(errorMsg);
            }

            let responseText = choice.message.content;
            const reasoning = choice.message.reasoning;

            this.debugLogger.log('Análise do conteúdo da resposta', {
                hasContent: !!responseText,
                contentLength: responseText?.length || 0,
                hasReasoning: !!reasoning,
                reasoningLength: reasoning?.length || 0,
                finishReason: choice.finish_reason
            });

            if ((!responseText || responseText.trim() === '') && reasoning) {
                console.log('📝 Usando reasoning como conteúdo principal');
                responseText = reasoning;
                
                this.debugLogger.log('Usando reasoning como conteúdo', {
                    reasoningUsed: true,
                    finalResponseLength: responseText.length
                });
            }

            if (!responseText || responseText.trim() === '') {
                const errorMsg = 'Resposta vazia da API';
                console.log('❌', errorMsg);
                this.debugLogger.error(errorMsg, {
                    content: choice.message.content,
                    reasoning: reasoning,
                    finishReason: choice.finish_reason
                });
                throw new Error(errorMsg);
            }

            let validation = null;
            let validatedAnalysis = null;
            let finalResponseText = responseText;
            if (dataPacket) {
                validation = validateAnalysisResponse(responseText, dataPacket);
                validatedAnalysis = validation.analysis;
                this.debugLogger.log('Validação anti-alucinação concluída', {
                    status: validation.status,
                    errors: validation.errors,
                    guardrailFlags: validation.guardrail_flags
                });

                if (validation.status === 'failed') {
                    return {
                        success: false,
                        error: 'Resposta da IA falhou validação anti-alucinação',
                        response: responseText,
                        validation,
                        tokensUsed: completion.usage?.total_tokens || 0,
                        responseTime,
                        model: this.config.model,
                        promptVersion,
                        promptHash
                    };
                }

                if (validatedAnalysis) finalResponseText = JSON.stringify(validatedAnalysis, null, 2);
            }

            console.log('✅ Análise concluída');
            console.log('📝 Tokens utilizados:', completion.usage?.total_tokens || 'N/A');
            console.log('📄 Tamanho da resposta:', finalResponseText.length, 'caracteres');

            this.debugLogger.success('Análise LLM concluída com sucesso', {
                tokensUsed: completion.usage?.total_tokens || 'N/A',
                responseLength: finalResponseText.length,
                responseTime: `${responseTime}ms`,
                finishReason: choice.finish_reason,
                model: this.config.model,
                promptVersion,
                validationStatus: validation?.status || 'not_applied'
            });

            this.debugLogger.section('CONTINUAÇÃO DO WORKFLOW');
            
            this.debugLogger.log('Verificando próximos passos do workflow', {
                hasResponse: !!finalResponseText,
                responseLength: finalResponseText.length,
                nextStep: 'Gerar PDF'
            });

            return {
                success: true,
                response: finalResponseText,
                analysis: validatedAnalysis,
                validation,
                tokensUsed: completion.usage?.total_tokens || 0,
                responseTime,
                model: this.config.model,
                promptVersion,
                promptHash,
                debug: {
                    hasReasoning: !!reasoning,
                    finishReason: choice.finish_reason,
                    reasoningLength: reasoning?.length || 0
                }
            };

        } catch (error) {
            console.log('❌ Erro na análise LLM:', error.message);
            
            this.debugLogger.error('Erro na análise LLM', {
                message: error.message,
                name: error.name,
                stack: error.stack,
                response: error.response?.data,
                caseData: process.env.LLM_DEBUG_FULL_PROMPT === 'true' ? caseData : '[redigido]',
                model: this.config.model
            });

            return {
                success: false,
                error: error.message,
                debug: {
                    errorName: error.name,
                    stack: error.stack,
                    model: this.config.model
                }
            };
        }
    }
}

module.exports = new LLMService();