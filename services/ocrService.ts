import axios from 'axios';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const config = require('../config/config');
const paperlessService = require('./paperlessService');
const documentModel = require('../models/document');

type Progress = (step: string, message: string, data?: Record<string, unknown>) => void;

class OcrService {
  private active = new Set<number>();

  isEnabled() {
    return config.ocr?.enabled === 'yes';
  }

  async recoverInterruptedJobs() {
    return documentModel.recoverInterruptedOcrJobs();
  }

  async downloadDocument(documentId: number): Promise<{ data: Buffer; mimeType: string }> {
    paperlessService.initialize();
    const response = await paperlessService.client.get(`/documents/${documentId}/download/`, {
      responseType: 'arraybuffer',
      maxContentLength: config.ocr.maxFileBytes,
      timeout: config.ocr.timeoutMs
    });
    return {
      data: Buffer.from(response.data),
      mimeType: String(response.headers['content-type'] || 'application/pdf').split(';')[0]
    };
  }

  async extractWithMistral(data: Buffer, mimeType: string) {
    if (!config.ocr.apiKey) throw new Error('OCR_API_KEY is required for Mistral OCR');
    const baseUrl = String(config.ocr.apiUrl || 'https://api.mistral.ai/v1').replace(/\/+$/, '');
    const response = await axios.post(`${baseUrl}/ocr`, {
      model: config.ocr.model,
      document: {
        type: 'document_url',
        document_url: `data:${mimeType};base64,${data.toString('base64')}`
      },
      include_image_base64: false
    }, {
      timeout: config.ocr.timeoutMs,
      headers: { Authorization: `Bearer ${config.ocr.apiKey}`, 'Content-Type': 'application/json' }
    });
    const pages = Array.isArray(response.data?.pages) ? response.data.pages : [];
    const text = pages.map((page: { markdown?: string }) => page.markdown || '').join('\n\n').trim();
    if (!text) throw new Error('OCR provider returned no text');
    return text;
  }

  async renderPdfPages(data: Buffer) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tagvico-ocr-'));
    const input = path.join(directory, 'input.pdf');
    const outputPrefix = path.join(directory, 'page');
    await fs.writeFile(input, data, { mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      const child = spawn('pdftoppm', ['-png', '-f', '1', '-l', String(config.ocr.maxPages), '-r', '160', input, outputPrefix], {
        stdio: ['ignore', 'ignore', 'pipe']
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`PDF rendering failed: ${stderr.trim() || `exit ${code}`}`)));
    });
    const pages = (await fs.readdir(directory))
      .filter((name) => /^page-\d+\.png$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((name) => path.join(directory, name));
    return { directory, pages };
  }

  async extractLocalImage(image: Buffer, mimeType: string) {
    const apiUrl = String(config.ocr.apiUrl || config.ollama?.apiUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const base64 = image.toString('base64');
    const headers = config.ocr.apiKey ? { Authorization: `Bearer ${config.ocr.apiKey}` } : {};
    const prompt = 'Perform OCR on this image. Return only the extracted text in plain text. Do not add explanations.';
    if (config.ocr.provider === 'ollama') {
      const response = await axios.post(`${apiUrl.replace(/\/v1$/i, '')}/api/chat`, {
        model: config.ocr.model,
        stream: false,
        messages: [{ role: 'user', content: prompt, images: [base64] }],
        options: { temperature: 0 }
      }, { timeout: config.ocr.timeoutMs, headers });
      return String(response.data?.message?.content || '').trim();
    }
    const response = await axios.post(`${/\/v1$/i.test(apiUrl) ? apiUrl : `${apiUrl}/v1`}/chat/completions`, {
      model: config.ocr.model,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
        ]
      }]
    }, { timeout: config.ocr.timeoutMs, headers });
    return String(response.data?.choices?.[0]?.message?.content || '').trim();
  }

  async extractWithLocalProvider(data: Buffer, mimeType: string, progress: Progress) {
    if (mimeType.startsWith('image/')) {
      const text = await this.extractLocalImage(data, mimeType);
      if (!text) throw new Error('Local OCR returned no text');
      return text;
    }
    const rendered = await this.renderPdfPages(data);
    try {
      if (!rendered.pages.length) throw new Error('PDF renderer returned no pages');
      const output: string[] = [];
      for (let index = 0; index < rendered.pages.length; index += 1) {
        progress('ocr', `Processing page ${index + 1} of ${rendered.pages.length}`);
        const image = await fs.readFile(rendered.pages[index]);
        const text = await this.extractLocalImage(image, 'image/png');
        if (text) output.push(text);
      }
      if (!output.length) throw new Error('Local OCR returned no text');
      return output.join('\n\n');
    } finally {
      await fs.rm(rendered.directory, { recursive: true, force: true });
    }
  }

  async writeBack(documentId: number, text: string) {
    try {
      paperlessService.initialize();
      await paperlessService.client.patch(`/documents/${documentId}/`, { content: text });
      return true;
    } catch (error) {
      return false;
    }
  }

  async process(documentId: number, progress: Progress = () => {}) {
    if (!this.isEnabled()) throw new Error('OCR rescue is disabled');
    if (!Number.isInteger(documentId) || documentId <= 0) throw new Error('Invalid document ID');
    if (this.active.has(documentId)) throw new Error(`Document ${documentId} is already processing`);
    this.active.add(documentId);
    const item = await documentModel.getOcrQueueItem(documentId);
    if (!item) throw new Error('Document is not in the OCR queue');
    try {
      await documentModel.updateOcrQueueStatus(documentId, 'processing', { incrementAttempts: true });
      progress('download', 'Downloading the original document');
      const { data, mimeType } = await this.downloadDocument(documentId);
      progress('ocr', `Sending document to ${config.ocr.provider}`);
      const text = config.ocr.provider === 'mistral'
        ? await this.extractWithMistral(data, mimeType)
        : await this.extractWithLocalProvider(data, mimeType, progress);
      await documentModel.updateOcrQueueStatus(documentId, 'ocr_complete', { text });
      progress('writeback', 'Writing OCR text back to Paperless-ngx');
      const wroteBack = await this.writeBack(documentId, text);
      await documentModel.updateOcrQueueStatus(documentId, 'done', { text });
      await documentModel.resetFailedDocument(documentId);
      progress('done', wroteBack ? 'OCR completed and content was updated' : 'OCR completed; text is stored locally');
      return { text, wroteBack };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await documentModel.updateOcrQueueStatus(documentId, 'failed', { error: message });
      await documentModel.addFailedDocument(documentId, item.title, 'ocr_failed', 'ocr', message);
      progress('error', message);
      throw error;
    } finally {
      this.active.delete(documentId);
    }
  }
}

export = new OcrService();
