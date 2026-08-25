import { describe, expect, it } from 'vitest';
import { ChainSchema, chainMeta } from '@stackr/models';
import {
  breadcrumbSchema,
  organizationSchema,
  serializeJsonLd,
  supportedChainNames,
  webApplicationSchema,
  webSiteSchema,
} from './structured-data';
import { PRODUCTION_SITE_URL } from './site';

describe('serializeJsonLd', () => {
  it('escapes < so a value cannot close the enclosing script element', () => {
    expect(serializeJsonLd({ name: '</script><img>' })).toBe(
      '{"name":"\\u003c/script>\\u003cimg>"}',
    );
  });
});

describe('organizationSchema', () => {
  const schema = organizationSchema(PRODUCTION_SITE_URL);

  it('declares the organization on the canonical origin', () => {
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Organization');
    expect(schema['@id']).toBe('https://stackr.ie/#organization');
    expect(schema.url).toBe('https://stackr.ie/');
    expect(schema.logo).toBe('https://stackr.ie/icons/icon-512.svg');
    expect(schema.sameAs).toEqual(['https://github.com/pete-watters/stackr']);
  });
});

describe('webSiteSchema', () => {
  const schema = webSiteSchema(PRODUCTION_SITE_URL);

  it('links the site to the organization node', () => {
    expect(schema['@type']).toBe('WebSite');
    expect(schema.publisher).toEqual({ '@id': 'https://stackr.ie/#organization' });
  });

  it('claims no SearchAction, because there is no site search', () => {
    expect(schema.potentialAction).toBeUndefined();
  });
});

describe('webApplicationSchema', () => {
  const schema = webApplicationSchema(PRODUCTION_SITE_URL);

  it('describes a free finance web application', () => {
    expect(schema['@type']).toBe('WebApplication');
    expect(schema.applicationCategory).toBe('FinanceApplication');
    expect(schema.operatingSystem).toBe('Web');
    expect(schema.isAccessibleForFree).toBe(true);
    expect(schema.offers).toMatchObject({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
  });

  it('never fabricates a rating', () => {
    expect(schema.aggregateRating).toBeUndefined();
    expect(schema.review).toBeUndefined();
  });

  it('lists every supported chain by name in the feature list', () => {
    const [chainFeature] = supportedFeatureList(schema.featureList);
    ChainSchema.options.forEach(chain => {
      expect(chainFeature).toContain(chainMeta[chain].name);
    });
  });
});

function supportedFeatureList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

describe('supportedChainNames', () => {
  it('is derived from the domain chain enum, so it cannot drift', () => {
    expect(supportedChainNames()).toEqual(['Bitcoin', 'Stacks', 'Ethereum', 'Solana', 'Sui']);
  });
});

describe('breadcrumbSchema', () => {
  it('numbers the trail from one and resolves absolute item URLs', () => {
    const schema = breadcrumbSchema(
      [
        { name: 'Portfolio', path: '/' },
        { name: 'Add a wallet', path: '/wallet/add' },
      ],
      PRODUCTION_SITE_URL,
    );

    expect(schema['@type']).toBe('BreadcrumbList');
    expect(schema.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Portfolio',
        item: 'https://stackr.ie/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Add a wallet',
        item: 'https://stackr.ie/wallet/add',
      },
    ]);
  });
});
