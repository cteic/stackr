import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { resolveEthRpcUrl } from '@stackr/services';

function getPublicClient() {
  // Same-origin proxy in the browser (where these queries run), public RPC
  // otherwise — the Alchemy key never reaches the client. See `resolveEthRpcUrl`.
  return createPublicClient({
    chain: mainnet,
    transport: http(resolveEthRpcUrl()),
  });
}

export function useEnsName(address?: `0x${string}`) {
  return useQuery({
    queryKey: ['ens', 'name', address],
    queryFn: () => getPublicClient().getEnsName({ address: address! }),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });
}

export function useEnsAddress(name?: string) {
  return useQuery({
    queryKey: ['ens', 'address', name],
    queryFn: () => getPublicClient().getEnsAddress({ name: name! }),
    enabled: !!name && name.endsWith('.eth'),
    staleTime: 5 * 60 * 1000,
  });
}
