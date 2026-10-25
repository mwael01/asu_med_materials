export type OgType = 'website' | 'article' | 'video.other' | 'profile';

export interface SeoProps {
  title?: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
  ogType?: OgType;
  ogImage?: string;
  keywords?: string[];
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

export type SitemapChangeFreq =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: SitemapChangeFreq;
  priority?: number;
}
