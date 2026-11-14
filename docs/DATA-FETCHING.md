# Data fetching

Every remote read goes through a hook in `packages/queries`. Every cache key is
built by the `queryKeys` factory in `packages/queries/src/keys.ts` and nowhere
else.

Inline array literals as query keys are banned, for two reasons:

- **A typo silently forks the cache.** `['stackr', 'balance', chain, addr]` and
  `['stackr', 'balances', chain, addr]` are two different queries. Both fetch,
  both cache, neither fails.
- **Prefix invalidation stops working.** Nothing can invalidate "every balance"
  unless every balance key came from the same builder.

## Key convention

Keys are hierarchical and read left to right, broadest to narrowest. Any prefix
is a valid invalidation target.

```ts
queryKeys.all; // ['stackr']
queryKeys.balances(); // ['stackr', 'balance']
queryKeys.balance('sol', address); // ['stackr', 'balance', 'sol', address]
```

`queryKeys.balances()` invalidates every chain's balance. `queryKeys.balance('sol', addr)`
invalidates one address on one chain. The narrow key spreads the broad one, so
the two can never drift apart.

| Factory                               | Scopes                                        |
| ------------------------------------- | --------------------------------------------- |
| `all`                                 | Root prefix — invalidates every read          |
| `health()`                            | Every liquidation-health position             |
| `healthPosition(protocol, address)`   | One protocol × address                        |
| `balances()`                          | Every chain's native balance                  |
| `balance(chain, address)`             | One chain × address                           |
| `tokenPositionsAll()`                 | Every chain's fungible token positions        |
| `tokenPositions(chain, address)`      | One chain × address                           |
| `transactionsAll()`                   | Every chain's transaction history             |
| `transactions(chain, address)`        | One chain × address                           |
| `prices()`                            | Every spot-price read                         |
| `pricesByChains(chains, currency)`    | One currency × chain set                      |
| `priceHistory(chain, days, currency)` | One chain's series at one window and currency |
| `nfts()`                              | Every NFT holdings read                       |
| `nftHoldings(protocol, address)`      | One protocol × address                        |
| `stockSearch(query)`                  | One symbol-search query                       |
| `stockQuotes(symbols)`                | One symbol set                                |
| `stockPriceHistory(symbol, days)`     | One symbol's series at one window             |

`priceHistory` and the three stock factories hang off `all` directly, not off
`prices()`. So `queryKeys.prices()` does not invalidate a price series.

## Cadence

The rule of thumb: data that changes per block is short-lived, data that changes
when the user acts is long-lived.

A native balance changes every block, so it is trusted for 30 seconds and polled
every 60. Token positions change when the user trades, so they are trusted for
two minutes and polled every five. The expensive fan-out reads are not polled at
all — they get a long `staleTime` and an explicit refresh action.

| Read               | `staleTime` | `refetchInterval` |
| ------------------ | ----------- | ----------------- |
| Native balance     | 30s         | 60s               |
| Prices             | 60s         | 120s              |
| Transactions       | 60s         | 120s              |
| Token positions    | 120s        | 300s              |
| Liquidation health | 5 min       | none — on demand  |
| NFT holdings       | 10 min      | none — on demand  |

## Retry and error typing

`retryRemoteRead` in `packages/queries/src/retry.ts` is the shared retry policy.
It refuses to retry two `ServiceError` kinds and retries everything else twice
with React Query's default backoff.

- `rate-limited` — the proxy has already refused this client for a window.
  Retrying inside that window deepens the hole and delays the honest "come back
  shortly" message the UI owes the user.
- `invalid-address` — a bad address is bad on every attempt. Retrying cannot
  change the answer.

Everything else is a transport blip, a 5xx or a malformed payload, and a second
attempt can succeed.

Hooks declare their error channel, so a component branches on a discriminant
rather than matching an error message string:

```ts
return useQuery<TokenPosition[], RemoteReadError>({
  queryKey: queryKeys.tokenPositions(chain, address),
  queryFn: () => fetchTokenPositions(chain, address),
  staleTime: 120_000,
  refetchInterval: 300_000,
  retry: retryRemoteRead,
});
```

`RemoteReadError` is `Error & { readonly serviceError?: ServiceError }`. A call
site reads `error.serviceError?.kind` and picks a message per kind —
`rate-limited` says "come back shortly", `upstream` says "this provider is
broken". `ServiceError` is defined in `packages/services/src/service-error.ts`;
its kinds are `network`, `invalid-address`, `upstream`, `rate-limited` and
`parse`. `serviceError` is optional, so handle `undefined` as an unknown fault.

`useTokenPositions` is the reference implementation. `useBalance`, `useBalances`,
`usePrices` and `useTransactions` follow it. The remaining hooks —
`useHealthPositions`, `useNftHoldings`, `useOrderbook`, `useLiveTicks`,
`usePriceHistory` and the three stock reads — still fall back to React Query's
defaults with an untyped error channel, and should be brought across when they
are next touched.

## Adding a new read

1. Add the key factory entry to `keys.ts`. Build it by spreading its broader
   sibling, so the prefix stays a valid invalidation target.
2. Add the hook in `packages/queries/src`. Type it `useQuery<T, RemoteReadError>`,
   take the key from the factory, set `staleTime` and `refetchInterval` from the
   cadence rule, and pass `retry: retryRemoteRead`.
3. Co-locate a test beside the hook as `use-thing.test.ts`. Stub `fetch`; no test
   touches the network (see `docs/TESTING.md`).
