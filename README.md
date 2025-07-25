# Paradex 
- setup .env
  ACCOUNT_ADDRESS /
  PUBLIC_KEY /
  PRIVATE_KEY (must be a valid Starknet private key, as a hex string) /
  ETHEREUM_ACCOUNT
- yarn install
- yarn run app

# Orderly

This repository contains examples of how to use [Orderly EVM API](https://testnet-docs-api-evm.orderly.network/) written in TypeScript.

## Run this example

- install Nodejs >= 18
- install yarn: `npm i -g yarn`
- clone this repository
- install dependencies: `yarn`
- set up a `.env` file by copying `.env.example` and insert your wallet's private key.
- run example: `yarn start`
- generate code from ABI files via typechain: `yarn typegen`
