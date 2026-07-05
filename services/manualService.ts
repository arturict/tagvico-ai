import fs from 'fs';
import axios from 'axios';
import OpenAI from 'openai';
import { AzureOpenAI } from 'openai';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writePromptToFile } = require('./serviceUtils');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../config/config');

interface Tag { name: string }
interface AnalysisResult {
    tags: unknown[];
    correspondent: string | null;
    title?: unknown;
    document_date?: unknown;
    document_type?: unknown;
    language?: unknown;
    custom_fields?: unknown;
}
type Provider = 'openai' | 'ollama' | 'custom' | 'azure';

function parseAnalysis(value: string): AnalysisResult {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid response structure');
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.tags) || typeof record.correspondent !== 'string') {
        throw new Error('Invalid response structure');
    }
    return { ...record, tags: record.tags, correspondent: record.correspondent };
}

class ManualService {
    openai: InstanceType<typeof OpenAI>;
    ollama?: ReturnType<typeof axios.create>;
    constructor() {
        if(config.aiProvider === 'custom'){
            this.openai = new OpenAI({
                apiKey: config.custom.apiKey,
                baseURL: config.custom.apiUrl
            });
        }else if (config.aiProvider === 'azure'){
            this.openai = new AzureOpenAI({
                    apiKey: config.azure.apiKey,
                    endpoint: config.azure.endpoint,
                    deployment: config.azure.deploymentName,
                    apiVersion: config.azure.apiVersion
                  });
        } else {            
            this.openai = new OpenAI({ apiKey: config.openai.apiKey });
            this.ollama = axios.create({
            timeout: 300000
            });
        }
    }

    
    async analyzeDocument(content: string, existingTags: Tag[], provider: Provider) {
        try {
        if (provider === 'openai') {
            return this._analyzeOpenAI(content, existingTags);
        } else if (provider === 'ollama') {
            return this._analyzeOllama(content, existingTags);
        } else if (provider === 'custom') {
            return this._analyzeCustom(content, existingTags);
        } else if (provider === 'azure') {
            return this._analyzeAzure(content, existingTags);
        } else {            
            throw new Error('Invalid provider');
        }
        } catch (error) {
        console.error('Error analyzing document:', error);
        return { tags: [], correspondent: null };
        }
    }
    
    async _analyzeOpenAI(content: string, existingTags: Tag[]) {
        try {
        void existingTags;
        const model = process.env.OPENAI_MODEL;
        const systemPrompt = process.env.SYSTEM_PROMPT;
        await writePromptToFile(systemPrompt, content);
        const response = await this.openai.chat.completions.create({
            model: model ?? '',
            messages: [
            {
                role: "system",
                content: systemPrompt ?? ''
            },
            {
                role: "user",
                content: content
            }
            ],
            ...(model !== 'o3-mini' && { temperature: 0.3 }),
        });
    
        let jsonContent = response.choices[0].message.content ?? '';
        jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        let parsedResponse: AnalysisResult;
        try {
            parsedResponse = parseAnalysis(jsonContent);
            fs.appendFile('./logs/response.txt', jsonContent, (err: NodeJS.ErrnoException | null) => {
                if (err) throw err;
            });
        } catch (error) {
            console.error('Failed to parse JSON response:', error);
            throw new Error('Invalid JSON response from API');
        }
        
        if (!Array.isArray(parsedResponse.tags) || typeof parsedResponse.correspondent !== 'string') {
            throw new Error('Invalid response structure');
        }
        
        return parsedResponse;
        } catch (error) {
        console.error('Failed to analyze document with OpenAI:', error);
        return { tags: [], correspondent: null };
        }
    }

    async _analyzeAzure(content: string, existingTags: Tag[]) {
        try {
        void existingTags;
    
        const systemPrompt = process.env.SYSTEM_PROMPT;
        await writePromptToFile(systemPrompt, content);
        const response = await this.openai.chat.completions.create({
            model: process.env.AZURE_DEPLOYMENT_NAME ?? '',
            messages: [
            {
                role: "system",
                content: systemPrompt ?? ''
            },
            {
                role: "user",
                content: content
            }
            ],
            temperature: 0.3,
        });
    
        let jsonContent = response.choices[0].message.content ?? '';
        jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        let parsedResponse: AnalysisResult;
        try {
            parsedResponse = parseAnalysis(jsonContent);
            fs.appendFile('./logs/response.txt', jsonContent, (err: NodeJS.ErrnoException | null) => {
                if (err) throw err;
            });
        } catch (error) {
            console.error('Failed to parse JSON response:', error);
            throw new Error('Invalid JSON response from API');
        }
        
        if (!Array.isArray(parsedResponse.tags) || typeof parsedResponse.correspondent !== 'string') {
            throw new Error('Invalid response structure');
        }
        
        return parsedResponse;
        } catch (error) {
        console.error('Failed to analyze document with OpenAI:', error);
        return { tags: [], correspondent: null };
        }
    }

    async _analyzeCustom(content: string, existingTags: Tag[]) {
        try {
            void existingTags;
        
            const systemPrompt = process.env.SYSTEM_PROMPT;
            const model = config.custom.model;
            const response = await this.openai.chat.completions.create({
                model: model,
                messages: [
                {
                    role: "system",
                    content: systemPrompt ?? ''
                },
                {
                    role: "user",
                    content: content
                }
                ],
                ...(model !== 'o3-mini' && { temperature: 0.3 }),
            });
        
            let jsonContent = response.choices[0].message.content ?? '';
            jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const parsedResponse = parseAnalysis(jsonContent);
            
            if (!Array.isArray(parsedResponse.tags) || typeof parsedResponse.correspondent !== 'string') {
                throw new Error('Invalid response structure');
            }
            
            return parsedResponse;
            } catch (error) {
            console.error('Failed to analyze document with OpenAI:', error);
            return { tags: [], correspondent: null };
            }
    }
    
    async _analyzeOllama(content: string, existingTags: Tag[]) {
        try {
        void content;
        void existingTags;
        const prompt = process.env.SYSTEM_PROMPT ?? '';
        
        const calculateNumCtx = (promptTokenCount: number, expectedResponseTokens: number) => {
            const totalTokenUsage = promptTokenCount + expectedResponseTokens;
            const maxCtxLimit = Number(config.tokenLimit);
            
            const numCtx = Math.min(totalTokenUsage, maxCtxLimit);
            
            console.log('Prompt Token Count:', promptTokenCount);
            console.log('Expected Response Tokens:', expectedResponseTokens);
            console.log('Dynamic calculated num_ctx:', numCtx);
            
            return numCtx;
        };
        
        const calculatePromptTokenCount = (prompt: string) => {
            return Math.ceil(prompt.length / 4);
        };
        
        const expectedResponseTokens = 1024;
        const promptTokenCount = calculatePromptTokenCount(prompt);
        
        const numCtx = calculateNumCtx(promptTokenCount, expectedResponseTokens);
        
        const response = await this.ollama!.post(`${config.ollama.apiUrl}/api/generate`, {
            model: config.ollama.model,
            prompt: prompt,
            stream: false,
            options: {
            temperature: 0.7,
            top_p: 0.9,
            repeat_penalty: 1.1,
            num_ctx: numCtx,
            }
        });
    
        if (!response.data || !response.data.response) {
            console.error('Unexpected Ollama response format:', response);
            throw new Error('Invalid response from Ollama API');
        }

        return this._parseResponse(response.data.response);
        }

        catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ECONNABORTED') {
            console.error('Timeout bei der Ollama-Anfrage:', error);
            throw new Error('Die Analyse hat zu lange gedauert. Bitte versuchen Sie es erneut.');
        }
        console.error('Error analyzing document with Ollama:', error);
        throw error;
        }
    }

    _parseResponse(response: string): AnalysisResult {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { tags: [], correspondent: null };
        return parseAnalysis(jsonMatch[0]);
    }
}

module.exports = ManualService; 
