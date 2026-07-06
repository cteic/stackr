// Link to a wallet's detail view: the server route `/wallet/[chain]/[address]`.
export function walletHref(chain: string, address: string): string {
  return `/wallet/${chain}/${address}`;
}
