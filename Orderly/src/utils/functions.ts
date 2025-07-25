import { ethers } from 'ethers';
import bs58 from 'bs58';
import { BASE_URL, BROKER_ID } from './config';
import { registerAccount, addAccessKey } from './register';

// Cache for wallet and orderly key
let cachedWallet: ethers.Wallet;
let cachedAccountId: string;
let cachedOrderlyKey: Uint8Array;

export async function initializeWallet() {
  if (!cachedWallet) {
    cachedWallet = new ethers.Wallet(process.env.PRIVATE_KEY!);
    const address = await cachedWallet.getAddress();
    console.log('Wallet initialized:', address);

    // Get or create account
    const getAccountRes = await fetch(
      `${BASE_URL}v1/get_account?address=${address}&broker_id=${BROKER_ID}`
    );
    const getAccountJson = await getAccountRes.json();

    if (getAccountJson.success) {
      cachedAccountId = getAccountJson.data.account_id;
    } else {
      cachedAccountId = await registerAccount(cachedWallet);
    }

    // Get or create orderly key
    try {
      cachedOrderlyKey = bs58.decode(process.env.ORDERLY_SECRET!);
    } catch (err) {
      cachedOrderlyKey = await addAccessKey(cachedWallet);
      console.log('New orderlyKey generated:', bs58.encode(cachedOrderlyKey));
      console.log('===== Add this to your .env: ORDERLY_SECRET=' + bs58.encode(cachedOrderlyKey) + ' =====');
    }
  }

  return { wallet: cachedWallet, accountId: cachedAccountId, orderlyKey: cachedOrderlyKey };
}

// Helper function to round price to tick size with proper decimal handling
export function roundToTick(price: number, tickSize: number = 0.01): number {
  // Use parseFloat and toFixed to avoid JavaScript decimal precision issues
  return parseFloat((Math.round(price / tickSize) * tickSize).toFixed(2));
}

// Calculate TP/SL prices based on PnL target in dollars
export function calculateTPSLFromPnL(entryPrice: number, quantity: number, tpPnL: number, slPnL: number) {
  // For a long position:
  // TP PnL = quantity * (tpPrice - entryPrice)
  // So: tpPrice = entryPrice + (tpPnL / quantity)
  
  // SL PnL = quantity * (slPrice - entryPrice) 
  // So: slPrice = entryPrice + (slPnL / quantity)
  // Note: slPnL should be negative for a loss
  
  const tpPriceOffset = tpPnL / quantity;
  const slPriceOffset = slPnL / quantity; // This will be negative
  
  const tpPrice = roundToTick(entryPrice + tpPriceOffset);
  const slPrice = roundToTick(entryPrice + slPriceOffset);
  
  console.log(`PnL Calculation: Entry=${entryPrice}, Qty=${quantity}`);
  console.log(`TP: $${tpPnL} target => ${tpPriceOffset} price move => ${tpPrice}`);
  console.log(`SL: $${slPnL} target => ${slPriceOffset} price move => ${slPrice}`);
  
  return { tpPrice, slPrice };
}

export function calculateStats(trades) {
  let totalPnL = 0;
  let executedOrders = 0;
  const volumeBySymbol = {};

  trades.forEach((trade) => {
    if (trade.status === 'FILLED') {
      executedOrders++;
      totalPnL += parseFloat(trade.realized_pnl || 0);
      const symbol = trade.symbol;
      volumeBySymbol[symbol] = (volumeBySymbol[symbol] || 0) + 1;
    }
  });


  return {
    executedOrders,
    totalPnL,
  };
}