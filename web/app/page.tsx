import type { Metadata } from "next";
import StockDownloaderForm from "./stock-downloader-form";
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
const socialImagePath = "/opengraph-image";
const twitterImagePath = "/twitter-image";

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
    images: [
      {
        url: socialImagePath,
        width: 1200,
        height: 630,
        alt: fullPageTitle,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: fullPageTitle,
    description: pageDescription,
    images: [twitterImagePath],
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
      <main className="flex-1 bg-gray-950 px-4 py-12 text-white">
        <div className="mx-auto w-full max-w-5xl">
          <section className="text-center">
            <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium tracking-[0.18em] text-blue-200 uppercase">
              NSE India Market Data Export
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Download NSE Historical Stock Data in Excel
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-300 sm:text-lg">
              Search NSE-listed companies by stock symbol or business name, choose a
              date range, and download historical stock prices in a spreadsheet-ready
              Excel file.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#download-form"
                className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Start Download
              </a>
              <a
                href="#faq"
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:border-white/30 hover:text-white"
              >
                Read FAQs
              </a>
            </div>
          </section>

          <div id="download-form" className="mx-auto mt-10 w-full max-w-md scroll-mt-24">
            <StockDownloaderForm />
            <div className="mt-4 space-y-2 text-center text-xs text-gray-500">
              <p>Data is fetched directly from NSE India. Large date ranges may take longer.</p>
              <p>
                Made by {siteCreator}.{" "}
                <a
                  href={creatorUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 transition-colors hover:text-blue-300"
                >
                  dhruvbhartiya.com
                </a>
              </p>
            </div>
          </div>

          <section className="mt-14 grid gap-4 md:grid-cols-3" aria-labelledby="features-heading">
            <h2 id="features-heading" className="sr-only">
              Key features
            </h2>
            {featureCards.map((card) => (
              <article
                key={card.title}
                className="rounded-2xl border border-white/8 bg-white/4 p-5"
              >
                <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-300">{card.description}</p>
              </article>
            ))}
          </section>

          <section
            id="how-it-works"
            className="mt-12 grid gap-6 md:grid-cols-2 scroll-mt-24"
          >
            <article className="rounded-2xl border border-white/8 bg-gray-900/60 p-6">
              <h2 className="text-xl font-semibold text-white">
                Download NSE historical data without manual cleanup
              </h2>
              <p className="mt-3 text-sm leading-7 text-gray-300">
                This tool is built for traders, investors, students, and analysts who
                need reliable historical stock price downloads from NSE India. Instead
                of manually copying market data into spreadsheets, you can export a
                ready-to-use Excel file in a few steps.
              </p>
            </article>

            <article className="rounded-2xl border border-white/8 bg-gray-900/60 p-6">
              <h2 className="text-xl font-semibold text-white">How the downloader works</h2>
              <p className="mt-3 text-sm leading-7 text-gray-300">
                Enter an NSE stock symbol, select your from and to dates, and start the
                download. The app fetches the data, combines multi-part requests when
                needed, and returns one Excel workbook for easier analysis.
              </p>
            </article>
          </section>

          <section
            id="faq"
            className="mt-12 rounded-2xl border border-white/8 bg-gray-900/60 p-6 scroll-mt-24"
          >
            <h2 className="text-2xl font-semibold text-white">
              Frequently asked questions
            </h2>
            <div className="mt-6 space-y-5">
              {faqItems.map((item) => (
                <article key={item.question}>
                  <h3 className="text-base font-semibold text-white">{item.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-gray-300">{item.answer}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
