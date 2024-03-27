
# Binance Trading Bot

  

> Binance trading bot using Ichimoku Indicator. Trailing stop with parabolic SAR. Tested on ETH/USDT on 4h chart

  

## Warnings

  

**The bots are for testing purpose. I cannot guarantee whether you can make money or not.**

  

**So use it at your own risk! I have no responsibility for any loss or hardship incurred directly or indirectly by using this code.


## How it works

  

### Overall concept


This bot is using Ichimoku to time the entry and parabolic SAR to trail stop.

  

> Ichimoku Indicator

> About Ichimoku Indicator you can find more [here](https://www.investopedia.com/terms/i/ichimokuchart.asp#:~:text=The%20Ichimoku%20Kinko%20Hyo%2C%20or,span%20B%20and%20chikou%20span.)

>Read more about Parabolic SAR [here](https://www.investopedia.com/trading/introduction-to-parabolic-sar/)

> TL;DR

> The bot uses 4 out of 5 ichimoku lines: 
> Tenkan-sen (conversion line)
> Kijun-sen (base line)
> Senkou Span A (leading span A)
> Senkou Span B (leading span B)
> Leading span A and B will be used to look for advantageous market conditions, while base line and conversion line will indicate the entry. Parabolic SAR will be used to place and update our stoploss on the go.


#### Buy Signal

  

The bot will continuously monitor your specified coin.

We only actively look for an entry when the closing price is both higher than leading span A and B.
The bot will enter a trade when the conversion line upper cut the base line. We control the maximum loss at 10% (you can configure the number) per trade. Since both the maximum loss and the stoploss price through SAR are predefined, the bot will calculate to enter with an appropriate volume.

Let's take an example. We have 10000 USD to trade. The market give a signal to buy when ETH price is at 3000 USD, and parabolic SAR at that moment is 2900, so we place our initial stoploss at 2900. We want our maximum loss is 10%, which is 1000 USD. Our entry volume will be calculated like this:
> Math.abs(0.1/10 *  10000/(2900/3000 - 1))


  

  

### Sell Signal

  

The idea is the same. We only actively look for an entry when the closing price is both lower than leading span A and B. 
The bot will enter a trade when the conversion line lower cut the base line. 
  

## How to use

  

1. Create `.env` file to save your configuration.

  

| Environment Key | Description |

| ------------------------------ | -------------------------------------------------------------------------  |

| WALLET 	| Your initial wallet amount|

| LEVERAGE	| Your leverage|

| INTERVAL	| which chart period you want to use. Recommend: '1h', '4h'|

| ITERATION_STEP | the interval the price update|

Parabolic SAR: this requires you to use TradingView or a similar tool. Visit the chart of your favorite coin, add Parabolic SAR as the indicator. You should specify Acceleration Factor, Acceleration Start and Acceleration Max (this required some back-testing since different coin fit with different numbers. Once you have the numbers, save them in their respective environment variables:


| ACC_START | Acceleration Start|

| ACC_INCR | Acceleration Factor|

| ACC_MAX | Acceleration Max|

In TradingView, from the most recent candle, backtrack until you meet a parabolic SAR pivot point from down to up (where the previous SAR point is higher than it's closing price, but the point you want is lower than it's closing price). Note down these stats in your .env file also: 

| START_DATE | The date the pivot happened, in ISO string|

| START_SAR | SAR point at that day|

| START_EXTREME | The highest price of the pivot candle|

| STOPLOSS_RATE | Your maximum stoploss price per trade|

| LIQUIDATED_STOPLOSS_RATE | Maximum stoploss price for your account|

  

## Changes & Todo

  
- [ ] Save the result in a database
- [ ] Create some UI for user to interact
- [ ] Allow controlling multiple trades at the same time
- [ ] Allow catching up when the bot meet some errors.
