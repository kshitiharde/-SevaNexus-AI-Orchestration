import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * LLM provider boundary (Member 3).
 *
 * Honesty first:
 *  - Default (no config): mode TEMPLATE_FALLBACK, provider status
 *    LOCAL_DETERMINISTIC. All "generation" is done by versioned templates —
 *    no LLM call is ever attempted, and none is ever implied.
 *  - LLM_PROVIDER=openai|ollama + LLM_API_KEY: mode LLM. If the provider is
 *    unreachable the call FAILS SAFE: the pipeline degrades to templates and
 *    reports provider_status REQUIRES_API_ACCESS. It never fabricates LLM
 *    output.
 *
 * The LLM (when available) is only used for EXPLANATION TEXT. It never
 * decides eligibility, service selection, consent, or any structured field.
 */

export type LlmMode = 'TEMPLATE_FALLBACK' | 'LLM';
export type LlmProviderStatus = 'LOCAL_DETERMINISTIC' | 'REQUIRES_API_ACCESS';

export interface LlmInfo {
  mode: LlmMode;
  providerStatus: LlmProviderStatus;
  model: string;
  model_version: string;
}

@Injectable()
export class LlmClient {
  private readonly logger = new Logger('LlmClient');
  private provider: string;
  private model: string;
  private baseUrl: string;
  private apiKey: string | null;

  constructor(cfg: ConfigService) {
    this.provider = (cfg.get<string>('LLM_PROVIDER') ?? 'template').toLowerCase();
    this.model =
      cfg.get<string>('LLM_MODEL') ??
      (this.provider === 'ollama' ? 'llama3' : this.provider === 'openai' ? 'gpt-4o-mini' : 'template-engine');
    this.baseUrl = cfg.get<string>('LLM_BASE_URL') ?? (this.provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1');
    this.apiKey = cfg.get<string>('LLM_API_KEY') ?? null;
    if (this.provider !== 'template' && !this.apiKey) {
      this.logger.warn(`LLM_PROVIDER=${this.provider} but LLM_API_KEY not set — staying in TEMPLATE_FALLBACK (honest, no LLM calls).`);
    }
  }

  info(): LlmInfo {
    const external = this.provider !== 'template';
    return {
      mode: external && this.apiKey ? 'LLM' : 'TEMPLATE_FALLBACK',
      providerStatus: external && !this.apiKey ? 'REQUIRES_API_ACCESS' : 'LOCAL_DETERMINISTIC',
      model: this.apiKey && external ? this.model : 'template-engine',
      model_version: external && this.apiKey ? '1' : '1.0.0',
    };
  }

  /**
   * One-shot completion. Only called in LLM mode. Returns null on ANY failure
   * so the caller falls back to templates (safe degradation).
   */
  async complete(system: string, user: string): Promise<string | null> {
    const info = this.info();
    if (info.mode !== 'LLM') return null;
    try {
      const body =
        this.provider === 'ollama'
          ? { model: this.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream: false }
          : { model: this.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: 300 };
      const res = await fetch(this.baseUrl + (this.provider === 'ollama' ? '/api/chat' : '/chat/completions'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as any;
      const text: string | undefined =
        this.provider === 'ollama' ? json?.message?.content : json?.choices?.[0]?.message?.content;
      return typeof text === 'string' && text.trim() ? text.trim() : null;
    } catch {
      return null;
    }
  }
}
