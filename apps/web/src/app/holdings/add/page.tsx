'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CurrencySchema,
  currencyMeta,
  ChainSchema,
  chainMeta,
  GoldUnitSchema,
  goldUnitMeta,
  AssetCategorySchema,
  assetCategoryMeta,
} from '@stackr/models';
import type { Currency, Chain, GoldUnit, AssetCategory } from '@stackr/models';
import { useStockSearch } from '@stackr/queries';
import {
  Button,
  Input,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@stackr/ui';
import { useHoldingsStore } from '@/lib/holdings-store';
import { Header } from '@/components/header';

const currencies = CurrencySchema.options;
const chains = ChainSchema.options;
const goldUnits = GoldUnitSchema.options;
const assetCategories = AssetCategorySchema.options;

export default function AddHoldingPage() {
  const router = useRouter();
  const addCashHolding = useHoldingsStore(s => s.addCashHolding);
  const addStockHolding = useHoldingsStore(s => s.addStockHolding);
  const addCryptoHolding = useHoldingsStore(s => s.addCryptoHolding);
  const addGoldHolding = useHoldingsStore(s => s.addGoldHolding);
  const addAssetHolding = useHoldingsStore(s => s.addAssetHolding);

  // Cash form state
  const [cashLabel, setCashLabel] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashCurrency, setCashCurrency] = useState<Currency>('usd');
  const [cashRate, setCashRate] = useState('');

  // Stock form state
  const [stockQuery, setStockQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState<{ symbol: string; name: string } | null>(null);
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');

  // Crypto form state
  const [cryptoChain, setCryptoChain] = useState<Chain>('btc');
  const [cryptoQuantity, setCryptoQuantity] = useState('');
  const [cryptoLabel, setCryptoLabel] = useState('');

  // Gold form state
  const [goldQuantity, setGoldQuantity] = useState('');
  const [goldUnit, setGoldUnit] = useState<GoldUnit>('oz');
  const [goldLabel, setGoldLabel] = useState('');

  // Asset form state
  const [assetName, setAssetName] = useState('');
  const [assetCategory, setAssetCategory] = useState<AssetCategory>('property');
  const [assetValue, setAssetValue] = useState('');
  const [assetCurrency, setAssetCurrency] = useState<Currency>('usd');
  const [assetNotes, setAssetNotes] = useState('');

  const { data: searchResults } = useStockSearch(stockQuery);

  const handleCashSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashLabel || !cashAmount) return;
    addCashHolding({
      label: cashLabel,
      amount: parseFloat(cashAmount),
      currency: cashCurrency,
      interestRate: cashRate ? parseFloat(cashRate) : 0,
    });
    router.push('/holdings');
  };

  const handleStockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStock || !shares) return;
    addStockHolding({
      symbol: selectedStock.symbol,
      name: selectedStock.name,
      shares: parseFloat(shares),
      avgCostBasis: costBasis ? parseFloat(costBasis) : undefined,
    });
    router.push('/holdings');
  };

  const handleCryptoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = parseFloat(cryptoQuantity);
    if (!(quantity > 0)) return;
    addCryptoHolding({
      chain: cryptoChain,
      quantity,
      label: cryptoLabel.trim() || undefined,
    });
    router.push('/holdings');
  };

  const handleGoldSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = parseFloat(goldQuantity);
    if (!(quantity > 0)) return;
    addGoldHolding({
      quantity,
      unit: goldUnit,
      label: goldLabel.trim() || undefined,
    });
    router.push('/holdings');
  };

  const handleAssetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(assetValue);
    if (!assetName.trim() || !(value > 0)) return;
    addAssetHolding({
      name: assetName.trim(),
      category: assetCategory,
      value,
      currency: assetCurrency,
      notes: assetNotes.trim() || undefined,
    });
    router.push('/holdings');
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Add Holding</h1>

        <Tabs defaultValue="cash">
          <TabsList className="w-full">
            <TabsTrigger value="cash" className="flex-1">
              Cash
            </TabsTrigger>
            <TabsTrigger value="stock" className="flex-1">
              Stock
            </TabsTrigger>
            <TabsTrigger value="crypto" className="flex-1">
              Crypto
            </TabsTrigger>
            <TabsTrigger value="gold" className="flex-1">
              Gold
            </TabsTrigger>
            <TabsTrigger value="asset" className="flex-1">
              Asset
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cash">
            <Card className="p-4 mt-4">
              <form onSubmit={handleCashSubmit} className="flex flex-col gap-4">
                <Input
                  label="Label"
                  value={cashLabel}
                  onChange={e => setCashLabel(e.target.value)}
                  placeholder="e.g. High-yield savings"
                  required
                />
                <Input
                  label="Amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={cashAmount}
                  onChange={e => setCashAmount(e.target.value)}
                  placeholder="10000.00"
                  required
                />
                <div className="space-y-1.5">
                  <label
                    htmlFor="cash-currency"
                    className="text-sm font-medium text-muted-foreground"
                  >
                    Currency
                  </label>
                  <Select
                    value={cashCurrency}
                    onValueChange={value => setCashCurrency(value as Currency)}
                  >
                    <SelectTrigger id="cash-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map(c => (
                        <SelectItem key={c} value={c}>
                          {currencyMeta[c].symbol} {currencyMeta[c].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Interest Rate (APY %)"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={cashRate}
                  onChange={e => setCashRate(e.target.value)}
                  placeholder="4.5"
                />
                <Button type="submit" className="mt-2">
                  Add Cash Holding
                </Button>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="stock">
            <Card className="p-4 mt-4">
              <form onSubmit={handleStockSubmit} className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Search Stock</label>
                  <Input
                    value={stockQuery}
                    onChange={e => {
                      setStockQuery(e.target.value);
                      setSelectedStock(null);
                    }}
                    placeholder="Search by symbol or name..."
                  />
                  {searchResults && searchResults.length > 0 && !selectedStock && (
                    <div className="border rounded-md max-h-48 overflow-auto">
                      {searchResults.map(r => (
                        <button
                          key={r.symbol}
                          type="button"
                          onClick={() => {
                            setSelectedStock({ symbol: r.symbol, name: r.name });
                            setStockQuery(r.symbol);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between"
                        >
                          <span>
                            <span className="font-mono font-semibold">{r.symbol}</span>
                            <span className="ml-2 text-muted-foreground">{r.name}</span>
                          </span>
                          <span className="text-xs text-muted-foreground">{r.region}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedStock && (
                    <div className="text-sm text-success">
                      Selected: {selectedStock.symbol} — {selectedStock.name}
                    </div>
                  )}
                </div>
                <Input
                  label="Number of Shares"
                  type="number"
                  step="0.001"
                  min="0"
                  value={shares}
                  onChange={e => setShares(e.target.value)}
                  placeholder="100"
                  required
                />
                <Input
                  label="Average Cost Basis (optional)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={costBasis}
                  onChange={e => setCostBasis(e.target.value)}
                  placeholder="150.00"
                />
                <Button type="submit" className="mt-2" disabled={!selectedStock}>
                  Add Stock Holding
                </Button>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="crypto">
            <Card className="p-4 mt-4">
              <form onSubmit={handleCryptoSubmit} className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="crypto-chain"
                    className="text-sm font-medium text-muted-foreground"
                  >
                    Chain
                  </label>
                  <Select
                    value={cryptoChain}
                    onValueChange={value => setCryptoChain(ChainSchema.parse(value))}
                  >
                    <SelectTrigger id="crypto-chain">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {chains.map(c => (
                        <SelectItem key={c} value={c}>
                          {chainMeta[c].name} ({chainMeta[c].symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Quantity"
                  type="number"
                  step="any"
                  min="0"
                  value={cryptoQuantity}
                  onChange={e => setCryptoQuantity(e.target.value)}
                  placeholder={`0.00 ${chainMeta[cryptoChain].symbol}`}
                  required
                />
                <Input
                  label="Label (optional)"
                  value={cryptoLabel}
                  onChange={e => setCryptoLabel(e.target.value)}
                  placeholder="e.g. Kraken balance"
                />
                <Button type="submit" className="mt-2" disabled={!(parseFloat(cryptoQuantity) > 0)}>
                  Add Crypto Holding
                </Button>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="gold">
            <Card className="p-4 mt-4">
              <form onSubmit={handleGoldSubmit} className="flex flex-col gap-4">
                <Input
                  label="Weight"
                  type="number"
                  step="any"
                  min="0"
                  value={goldQuantity}
                  onChange={e => setGoldQuantity(e.target.value)}
                  placeholder={goldUnit === 'oz' ? '2.5' : '100'}
                  required
                />
                <div className="space-y-1.5">
                  <label htmlFor="gold-unit" className="text-sm font-medium text-muted-foreground">
                    Unit
                  </label>
                  <Select
                    value={goldUnit}
                    onValueChange={value => setGoldUnit(GoldUnitSchema.parse(value))}
                  >
                    <SelectTrigger id="gold-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {goldUnits.map(u => (
                        <SelectItem key={u} value={u}>
                          {goldUnitMeta[u].name} ({goldUnitMeta[u].abbrev})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Label (optional)"
                  value={goldLabel}
                  onChange={e => setGoldLabel(e.target.value)}
                  placeholder="e.g. Krugerrand coins"
                />
                <p className="text-xs text-muted-foreground">
                  Valued at spot gold (via PAX Gold) in your display currency.
                </p>
                <Button type="submit" className="mt-2" disabled={!(parseFloat(goldQuantity) > 0)}>
                  Add Gold Holding
                </Button>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="asset">
            <Card className="p-4 mt-4">
              <form onSubmit={handleAssetSubmit} className="flex flex-col gap-4">
                <Input
                  label="Name"
                  value={assetName}
                  onChange={e => setAssetName(e.target.value)}
                  placeholder="e.g. Apartment"
                  required
                />
                <div className="space-y-1.5">
                  <label
                    htmlFor="asset-category"
                    className="text-sm font-medium text-muted-foreground"
                  >
                    Category
                  </label>
                  <Select
                    value={assetCategory}
                    onValueChange={value => setAssetCategory(AssetCategorySchema.parse(value))}
                  >
                    <SelectTrigger id="asset-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assetCategories.map(c => (
                        <SelectItem key={c} value={c}>
                          {assetCategoryMeta[c].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Current Value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={assetValue}
                  onChange={e => setAssetValue(e.target.value)}
                  placeholder="350000.00"
                  required
                />
                <div className="space-y-1.5">
                  <label
                    htmlFor="asset-currency"
                    className="text-sm font-medium text-muted-foreground"
                  >
                    Currency
                  </label>
                  <Select
                    value={assetCurrency}
                    onValueChange={value => setAssetCurrency(CurrencySchema.parse(value))}
                  >
                    <SelectTrigger id="asset-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map(c => (
                        <SelectItem key={c} value={c}>
                          {currencyMeta[c].symbol} {currencyMeta[c].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Notes (optional)"
                  value={assetNotes}
                  onChange={e => setAssetNotes(e.target.value)}
                  placeholder="e.g. Last valued at purchase"
                />
                <p className="text-xs text-muted-foreground">
                  Self-valued — there is no price feed, so update the value whenever it changes.
                </p>
                <Button
                  type="submit"
                  className="mt-2"
                  disabled={!assetName.trim() || !(parseFloat(assetValue) > 0)}
                >
                  Add Asset
                </Button>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
