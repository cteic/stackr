import { chainMeta, ChainSchema, type Chain } from '@stackr/models';
import {
  absoluteUrl,
  resolveSiteUrl,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_SAME_AS,
  SITE_TAGLINE,
} from '@/lib/site';

/**
 * Typed JSON-LD emission.
 *
 * Answer engines and LLM retrievers parse `application/ld+json` far more
 * reliably than they parse our client-rendered markup, so the graph below is
 * the machine-readable half of every page. Two rules it holds to:
 *
 * 1. Only claims that are true. There is no site search, so `WebSite` carries
 *    no `SearchAction`; there are no user ratings, so `WebApplication` carries
 *    no `aggregateRating` (fabricating one breaks Google's structured-data
 *    policy). The `featureList` is derived from `ChainSchema`, so it cannot
 *    drift from the chains actually supported.
 * 2. No `any` and no casts. `JsonLdValue` is a closed recursive union, so a
 *    malformed node is a type error rather than a runtime surprise.
 */

export type JsonLdValue = string | number | boolean | null | JsonLdValue[] | JsonLdObject;

export interface JsonLdObject {
  [key: string]: JsonLdValue | undefined;
}

/**
 * Serialize for embedding inside `<script>`. `<` is escaped so a value can
 * never close the enclosing element — every value here is a compile-time
 * constant today, but the escape keeps that a property of the emitter rather
 * than of its current callers.
 */
export function serializeJsonLd(schema: JsonLdObject): string {
  return JSON.stringify(schema).replace(/</g, '\\u003c');
}

interface JsonLdProps {
  schema: JsonLdObject;
}

export function JsonLd({ schema }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  );
}

/** Stable node ids so the separate scripts resolve into one connected graph. */
function organizationId(siteUrl: string): string {
  return `${siteUrl}/#organization`;
}

function webSiteId(siteUrl: string): string {
  return `${siteUrl}/#website`;
}

export function organizationSchema(siteUrl: string = resolveSiteUrl()): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organizationId(siteUrl),
    name: SITE_NAME,
    url: absoluteUrl('/', siteUrl),
    logo: absoluteUrl('/icons/icon-512.svg', siteUrl),
    description: SITE_DESCRIPTION,
    sameAs: [...SITE_SAME_AS],
  };
}

/**
 * No `potentialAction`/`SearchAction`: Stackr has no site-search endpoint, and
 * declaring one that 404s is a false claim about the site.
 */
export function webSiteSchema(siteUrl: string = resolveSiteUrl()): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': webSiteId(siteUrl),
    name: SITE_NAME,
    alternateName: `${SITE_NAME} — ${SITE_TAGLINE}`,
    url: absoluteUrl('/', siteUrl),
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
    publisher: { '@id': organizationId(siteUrl) },
  };
}

/** Every chain the app can read a balance for, straight off the domain enum. */
export function supportedChainNames(): string[] {
  return ChainSchema.options.map((chain: Chain) => chainMeta[chain].name);
}

export function webApplicationSchema(siteUrl: string = resolveSiteUrl()): JsonLdObject {
  const chains = supportedChainNames().join(', ');

  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${siteUrl}/#webapp`,
    name: SITE_NAME,
    url: absoluteUrl('/', siteUrl),
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    browserRequirements: 'Requires JavaScript.',
    description: SITE_DESCRIPTION,
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    featureList: [
      `Watch-only balances for ${chains}`,
      'Cash, stock and physical gold holdings alongside on-chain balances',
      'Liquidation health for Aave, Kamino, Zest, Granite and Arkadiko positions',
      'Stacks SIP-9 collectibles with floor-price estimates',
      'Live crypto prices and a streaming order book',
      'Self-custody by design: no account required and no private keys held',
    ],
    publisher: { '@id': organizationId(siteUrl) },
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbSchema(
  items: readonly BreadcrumbItem[],
  siteUrl: string = resolveSiteUrl(),
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, siteUrl),
    })),
  };
}
