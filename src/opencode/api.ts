/**
 * 魂器 OpenCode API 客户端
 * 通过 REST API 与 OpenCode serve 通信
 */

const SERVER_URL = 'http://localhost:19876';

export class OpenCodeAPI {
  async callLLM(prompt: string): Promise<string | null> {
    try {
      const s = await fetch(`${SERVER_URL}/session`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'knowledge-worker' })
      });
      const session = await s.json() as any;
      const r = await fetch(`${SERVER_URL}/session/${session.id}/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts: [{ type: 'text', text: prompt }] })
      });
      const reply = await r.json() as any;
      return reply.parts?.find((p: any) => p.type === 'text')?.text || null;
    } catch { return null; }
  }
}
