export const siteName = "NSE Historical Data Downloader";
export const siteCreator = "Dhruv Bhartiya";
export const creatorUrl = "https://dhruvbhartiya.com";
export const siteDescription =
  "Download NSE India historical stock prices in Excel. Search by stock symbol or company name, choose a date range, and export daily NSE market data in seconds.";
export const siteKeywords = [
  "NSE historical data",
  "NSE stock data download",
  "NSE India historical prices",
  "historical stock prices India",
  "NSE Excel download",
  "NSE stock price downloader",
  "NSE market data",
  "stock market data India",
];

export const featureCards = [
  {
    title: "Export daily NSE price history",
    description:
      "Download open, high, low, close, volume, and traded value data for NSE-listed stocks in an Excel file.",
  },
  {
    title: "Search by symbol or company name",
    description:
      "Use built-in autocomplete to quickly find companies listed on the National Stock Exchange of India.",
  },
  {
    title: "Handle larger date ranges",
    description:
      "Longer requests are split into smaller fetches behind the scenes and combined into a single downloadable workbook.",
  },
];

export const faqItems = [
  {
    question: "What data can I download from this NSE historical data tool?",
    answer:
      "You can download daily historical stock market data for NSE-listed companies, including price and trading fields returned by the NSE source data.",
  },
  {
    question: "Can I search using a company name instead of only a ticker symbol?",
    answer:
      "Yes. The search box supports both stock symbols and company names, and suggests matching NSE stocks as you type.",
  },
  {
    question: "Does the downloader support long date ranges?",
    answer:
      "Yes. The app breaks large date ranges into smaller requests so you can still export longer stretches of historical NSE data more reliably.",
  },
];

function normalizeUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `https://${url}`;
}

export function getSiteUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();

  if (configuredUrl) {
    return normalizeUrl(configuredUrl);
  }

  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProductionUrl) {
    return normalizeUrl(vercelProductionUrl);
  }

  const vercelPreviewUrl = process.env.VERCEL_URL?.trim();
  if (vercelPreviewUrl) {
    return normalizeUrl(vercelPreviewUrl);
  }

  return "http://localhost:3000";
}
