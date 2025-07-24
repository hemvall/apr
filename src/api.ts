import express from 'express';
import cors from 'cors';
const axios = require('axios');


import { config } from 'dotenv';
import { OrderSide, OrderType } from '@orderly.network/types';
import { webcrypto } from 'node:crypto';

import { getClientHolding, getOpenAlgoOrders, getOpenOrders } from './account';
import { cancelAlgoOrder, cancelOrder, createAlgoOrder, createOrder } from './order';
import { getOrderbook } from './orderbook';
import { BASE_URL } from './config';
import { initializeWallet, roundToTick, calculateTPSLFromPnL, calculateStats } from './utils/functions'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (!globalThis.crypto) globalThis.crypto = webcrypto;

config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET  /health - Health check');
  console.log('  GET  /account - Get account info');
  console.log('  GET  /market/:symbol - Get market price');
  console.log('  POST /order - Create order with TP/SL based on PnL');
  console.log('  GET  /orders - Get open orders');
  console.log('  DELETE /order/:orderId - Cancel order');
  console.log('\n📝 POST /order body parameters:');
  console.log('  - quantity: Order size (default: 0.005)');
  console.log('  - tpPnL: Target profit in $ (default: 3)');
  console.log('  - slPnL: Target loss in $ (default: -3)');
  console.log('  - side: BUY or SELL (default: BUY)');
  console.log('  - symbol: Trading pair (default: PERP_ETH_USDC)');
});

/* GET Endpoints */
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Get account info
app.get('/account', async (req, res) => {
  try {
    const { accountId, orderlyKey } = await initializeWallet();
    const holdings = await getClientHolding(accountId, orderlyKey);
    res.json({ success: true, accountId, holdings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// Get current market price
app.get('/market/:symbol', async (req, res) => {
  try {
    const { accountId, orderlyKey } = await initializeWallet();
    const symbol = req.params.symbol || 'PERP_ETH_USDC';

    const orderbook = await getOrderbook(symbol, 1, accountId, orderlyKey);
    const currentPrice = (orderbook.data.bids[0].price + orderbook.data.asks[0].price) / 2;

    res.json({
      success: true,
      symbol,
      currentPrice: roundToTick(currentPrice),
      bid: orderbook.data.bids[0].price,
      ask: orderbook.data.asks[0].price,
      spread: roundToTick(orderbook.data.asks[0].price - orderbook.data.bids[0].price)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// Get open orders
app.get('/orders', async (req, res) => {
  try {
    const { accountId, orderlyKey } = await initializeWallet();

    const orders = await getOpenOrders(accountId, orderlyKey);
    const algoOrders = await getOpenAlgoOrders('STOP', accountId, orderlyKey);

    res.json({
      success: true,
      orders,
      algoOrders
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// Endpoint /stats
app.get('/stats', async (req, res) => {
  const { orderlyKey } = await initializeWallet();

  try {
    // Exemple : tu peux récupérer les trades en live depuis l’API Orderly (si disponible)
    const response = await axios.get(`${BASE_URL}/v1/trades`, {
      headers: {
        'Orderly-Api-Key': orderlyKey,
        'Orderly-Timestamp': Date.now(),
        // Signature HMAC ici si nécessaire
      },
    });

    const trades = response.data?.data || [];

    const stats = calculateStats(trades);

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error fetching stats:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});


/* POST Endpoints */
// Create order with TP/SL based on PnL targets
app.post('/order', async (req, res) => {
  try {
    const { accountId, orderlyKey } = await initializeWallet();
    const {
      symbol = 'PERP_ETH_USDC',
      quantity = 0.005,
      tpPnL = 3,      // Target profit in dollars (default $3)
      slPnL = -3,     // Target loss in dollars (default -$3)
      side = 'BUY'   // Order side
    } = req.body;

    // Validate inputs
    if (quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Quantity must be positive' });
    }
    if (tpPnL <= 0) {
      return res.status(400).json({ success: false, error: 'Take profit PnL must be positive' });
    }
    if (slPnL >= 0) {
      return res.status(400).json({ success: false, error: 'Stop loss PnL must be negative' });
    }

    // Get current market price
    const orderbook = await getOrderbook(symbol, 1, accountId, orderlyKey);
    const asks = orderbook.data.asks;
    const bids = orderbook.data.bids;
    const currentPrice = (bids[0].price + asks[0].price) / 2;

    // Determine entry price based on side
    let entryPrice: number;
    let orderPrice: number;

    if (side.toUpperCase() === 'BUY') {
      // For buy orders, use ask price + small buffer
      orderPrice = asks[0].price + 0.5;
      entryPrice = asks[0].price; // Expected fill price
    } else {
      // For sell orders, use bid price - small buffer
      orderPrice = bids[0].price - 0.5;
      entryPrice = bids[0].price; // Expected fill price
    }

    // Create the order
    console.log(`Creating ${side} order for ${quantity} units at ~${entryPrice}...`);
    const orderResult = await createOrder(
      symbol,
      OrderType.LIMIT,
      side.toUpperCase() === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
      orderPrice,
      quantity,
      accountId,
      orderlyKey
    );

    // Wait for order execution
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Calculate TP/SL prices based on PnL targets
    const { tpPrice, slPrice } = calculateTPSLFromPnL(entryPrice, quantity, tpPnL, slPnL);

    console.log(`Creating TP/SL orders based on PnL targets...`);
    console.log(`Entry: ${entryPrice}, TP: ${tpPrice} (+$${tpPnL}), SL: ${slPrice} ($${slPnL})`);

    let tpOrderSuccess = false;
    let slOrderSuccess = false;
    let tpError = null;
    let slError = null;

    // For a buy order, TP and SL are sell orders
    // For a sell order, TP and SL are buy orders
    const tpslSide = side.toUpperCase() === 'BUY' ? OrderSide.SELL : OrderSide.BUY;

    // Determine which price should be higher for TP
    const isLong = side.toUpperCase() === 'BUY';
    const actualTpPrice = isLong ? Math.max(tpPrice, slPrice) : Math.min(tpPrice, slPrice);
    const actualSlPrice = isLong ? Math.min(tpPrice, slPrice) : Math.max(tpPrice, slPrice);

    // Take Profit order
    try {
      console.log(`Creating TP order at ${actualTpPrice}...`);
      await createAlgoOrder(
        {
          symbol,
          algo_type: 'STOP',
          quantity,
          trigger_price: actualTpPrice,
          trigger_price_type: 'MARK_PRICE',
          side: tpslSide,
          type: OrderType.MARKET,
          reduce_only: true
        },
        accountId,
        orderlyKey
      );
      tpOrderSuccess = true;
      console.log('TP order created successfully');
    } catch (error: any) {
      tpError = error.message || 'Unknown error';
      console.error('Failed to create TP order:', tpError);
    }

    // Wait to avoid rate limit
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Stop Loss order
    try {
      console.log(`Creating SL order at ${actualSlPrice}...`);
      await createAlgoOrder(
        {
          symbol,
          algo_type: 'STOP',
          quantity,
          trigger_price: actualSlPrice,
          trigger_price_type: 'MARK_PRICE',
          side: tpslSide,
          type: OrderType.MARKET,
          reduce_only: true
        },
        accountId,
        orderlyKey
      );
      slOrderSuccess = true;
      console.log('SL order created successfully');
    } catch (error: any) {
      slError = error.message || 'Unknown error';
      console.error('Failed to create SL order:', slError);
    }

    res.json({
      success: true,
      message: 'Order placed',
      order: {
        symbol,
        side,
        quantity,
        entryPrice: roundToTick(entryPrice),
        orderPrice: roundToTick(orderPrice)
      },
      tpsl: {
        tpPrice: actualTpPrice,
        slPrice: actualSlPrice,
        tpPnL: `$${tpPnL}`,
        slPnL: `$${slPnL}`,
        tpSuccess: tpOrderSuccess,
        slSuccess: slOrderSuccess,
        tpError,
        slError
      }
    });
  } catch (error: any) {
    console.error('Order creation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


/* DELETE Endpoints */
// Cancel order
app.delete('/order/:orderId', async (req, res) => {
  try {
    const { accountId, orderlyKey } = await initializeWallet();
    const { orderId } = req.params;
    const { symbol = 'PERP_ETH_USDC', isAlgo = false } = req.body;

    if (isAlgo) {
      await cancelAlgoOrder(orderId, symbol, accountId, orderlyKey);
    } else {
      await cancelOrder(orderId, symbol, accountId, orderlyKey);
    }

    res.json({ success: true, message: 'Order cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initialize wallet on startup
initializeWallet().catch(console.error);
