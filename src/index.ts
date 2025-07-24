import { OrderSide, OrderType } from '@orderly.network/types';
import bs58 from 'bs58';
import { config } from 'dotenv';
import { AbiCoder, ethers, keccak256, solidityPackedKeccak256 } from 'ethers';
import { webcrypto } from 'node:crypto';

import { getClientHolding, getOpenAlgoOrders, getOpenOrders } from './account';
import { BASE_URL, BROKER_ID } from './config';
import { cancelAlgoOrder, cancelOrder, createAlgoOrder, createOrder } from './order';
import { getOrderbook } from './orderbook';
import { addAccessKey, registerAccount } from './register';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (!globalThis.crypto) globalThis.crypto = webcrypto;

config();

async function main() {
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!);
  const address = await wallet.getAddress();
  console.log('Wallet address', address);

  const getAccountRes = await fetch(
    `${BASE_URL}v1/get_account?address=${address}&broker_id=${BROKER_ID}`
  );
  const getAccountJson = await getAccountRes.json();
  console.log('getAccountJson', JSON.stringify(getAccountJson, undefined, 2));

  let accountId: string;
  if (getAccountJson.success) {
    accountId = getAccountJson.data.account_id;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    accountId = await registerAccount(wallet);
  }

  let orderlyKey: Uint8Array;
  try {
    orderlyKey = bs58.decode(process.env.ORDERLY_SECRET!);
  } catch (err) {
    orderlyKey = await addAccessKey(wallet);
    console.log('orderlyKey', bs58.encode(orderlyKey));
    console.log('===== PASTE THIS KEY INTO YOUR .env file as ORDERLY_SECRET=<your_key> =====');
  }

  await getClientHolding(accountId, orderlyKey);

  const symbol = 'PERP_ETH_USDC';
  const {
    data: { asks, bids }
  } = await getOrderbook(symbol, 1, accountId, orderlyKey);

  // Get current market price (mid price between best bid and ask)
  const currentPrice = (bids[0].price + asks[0].price) / 2;
  console.log('Current market price:', currentPrice);

  // First, create a market order to buy 0.005 ETH
  console.log('Creating market order to buy 0.005 ETH...');
  // For market orders, we need to use a limit order with the ask price
  await createOrder(
    symbol,
    OrderType.LIMIT,
    OrderSide.BUY,
    asks[0].price + 0.5, // Use ask price + small buffer to ensure execution
    0.005, // 0.005 ETH
    accountId,
    orderlyKey
  );

  // Wait a bit for the order to be executed
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Create a TP/SL order with take profit at +$3 and stop loss at -$3
  const tpPrice = Math.round((currentPrice + 3) * 100) / 100; // Take profit at +$3, rounded to 0.01
  const slPrice = Math.round((currentPrice - 3) * 100) / 100; // Stop loss at -$3, rounded to 0.01

  console.log(`Creating TP/SL order: TP at ${tpPrice}, SL at ${slPrice}`);
  
  // Create separate TP and SL orders
  // Take Profit order
  await createAlgoOrder(
    {
      symbol,
      algo_type: 'STOP',
      quantity: 0.005,
      trigger_price: tpPrice,
      trigger_price_type: 'MARK_PRICE',
      side: OrderSide.SELL,
      type: OrderType.MARKET,
      reduce_only: true
    },
    accountId,
    orderlyKey
  );

  // Wait to avoid rate limit
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Stop Loss order
  await createAlgoOrder(
    {
      symbol,
      algo_type: 'STOP',
      quantity: 0.005,
      trigger_price: slPrice,
      trigger_price_type: 'MARK_PRICE',
      side: OrderSide.SELL,
      type: OrderType.MARKET,
      reduce_only: true
    },
    accountId,
    orderlyKey
  );

  console.log('Order placed successfully with TP/SL!');
  console.log('The order will remain active until TP or SL is hit.');

  // Monitor open algo orders
  const algoOrders = await getOpenAlgoOrders('STOP', accountId, orderlyKey);
  console.log('Active TP/SL orders:', JSON.stringify(algoOrders, undefined, 2))
}

export function getAccountId(userAddress, brokerId) {
  const abicoder = AbiCoder.defaultAbiCoder();
  return keccak256(
    abicoder.encode(
      ['address', 'bytes32'],
      [userAddress, solidityPackedKeccak256(['string'], [brokerId])]
    )
  );
}

main();
