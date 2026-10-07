import { type SearchParams, type UniformSearchResponse } from '@lobechat/types';
import { TRPCError } from '@trpc/server';

import { type SearchServiceImpl } from '../type';

interface SearchData {
  organic?: { link: string; snippet?: string; title?: string }[];
}

export class LitescrapeImpl implements SearchServiceImpl {
  async query(query: string, params: SearchParams = {}): Promise<UniformSearchResponse> {
    const apiKey = process.env.LITESCRAPE_API_KEY;
    if (!apiKey) {
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'LITESCRAPE_API_KEY is required.',
      });
    }
    const baseUrl = process.env.LITESCRAPE_BASE_URL || 'https://api.litescrape.com';
    const timeRanges: Record<string, string> = { day: 'd', month: 'm', week: 'w', year: 'y' };
    const timeRange = params.searchTimeRange;
    const period = timeRange && timeRange !== 'anytime' ? timeRanges[timeRange] : undefined;
    const startAt = Date.now();

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/search`, {
        body: JSON.stringify({ num: 10, q: query, tbs: period ? `qdr:${period}` : undefined }),
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
        method: 'POST',
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new TRPCError({
          code: 'SERVICE_UNAVAILABLE',
          message: `Search request failed: HTTP ${response.status}`,
        });
      }
      const data = (await response.json()) as SearchData;
      const results = (data.organic || []).map((result) => ({
        category: 'general',
        content: result.snippet || '',
        engines: ['litescrape'],
        parsedUrl: result.link ? new URL(result.link).hostname : '',
        score: 0,
        title: result.title || '',
        url: result.link,
      }));
      return { costTime: Date.now() - startAt, query, resultNumbers: results.length, results };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        cause: error instanceof Error ? error.name : undefined,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Search request failed.',
      });
    }
  }
}
