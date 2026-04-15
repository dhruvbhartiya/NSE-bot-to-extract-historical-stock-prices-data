import type { Metadata } from "next";
import HomePageClient from "./home-page-client";
import {
  creatorUrl,
  faqItems,
  featureCards,
  getSiteUrl,
  siteCreator,
  siteKeywords,
  siteName,
} from "../lib/site";

const pageTitle = "Download NSE Historical Stock Data in Excel";
const fullPageTitle = `${pageTitle} | ${siteName}`;
const pageDescription =
  "Download daily NSE India historical stock prices in Excel. Search by company name or stock symbol, choose a date range, and export market data in seconds.";

export const metadata: Metadata = {
  title: fullPageTitle,
  description: pageDescription,
  keywords: siteKeywords,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: fullPageTitle,
    description: pageDescription,
    url: "/",
  },
  twitter: {
    card: "summary",
    title: fullPageTitle,
    description: pageDescription,
  },
};

export default function Home() {
  const siteUrl = getSiteUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: siteName,
        url: siteUrl,
        description: pageDescription,
        inLanguage: "en-IN",
      },
      {
        "@type": "SoftwareApplication",
        name: siteName,
        url: siteUrl,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        description: pageDescription,
        creator: {
          "@type": "Person",
          name: siteCreator,
          url: creatorUrl,
        },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "INR",
        },
        featureList: featureCards.map((card) => card.title),
      },
      {
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <HomePageClient />
    </>
  );
}
