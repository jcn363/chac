export interface UrlFetcherServiceType {
  fetchUrl(url: string): Promise<UrlFetchResult>;
  isAccessible(url: string): Promise<boolean>;
}

export interface UrlFetchResult {
  url: string;
  title: string;
  content: string;
  description?: string;
  contentType: string;
  fetchedAt: string;
}
