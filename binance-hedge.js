const ccxt = require('ccxt')
let entry1
let entry2
let stoplossOrder1
let stoplossOrder2
let trailingOrder1
let trailingOrder2
let takeProfitOrder1
let takeProfitOrder2
let wallet = 23
let LEVERAGE = 5
let latestEntryTime
const SYMBOL = 'AXSUSDT'
const ITERATION_STEP = 5000
const preBalance = 25
let trailingThreshold1 = 0
let trailingThreshold2 = 0
const binanceusdm = new ccxt.binanceusdm({
    'apiKey': 'NouLnleEVV4dR6B9sLsYRZEOCRY49cqkILWkYqx699RXvzzjSPUq6fI9i1g3PJ4Z',
    'secret': '5tbxJ2OgSkMhFWVhxOrIM2j5VqZZLWlTmuTmMgHq1PfWd1If6ADcPuPjsyqpHzJB',
})
// binanceusdm.setSandboxMode(true)
const binance = new ccxt.binanceusdm();
// binance.setSandboxMode(true)

// const binanceusdm = new ccxt.binanceusdm({
//     'apiKey': 'a8e485d5858a657bcc06d776f060d12251d683f5686a9fe71e75772937a8dc88',
//     'secret': 'c098fba2dc7b2c2a277fadab223949e5f26681ecc0eb602294801af86f9997dd',
// })
// binanceusdm.setSandboxMode(true)
// const binance = new ccxt.binanceusdm();
// binance.setSandboxMode(true)

main()

async function main() {
    console.log('run')
    await setupFuture()
    // await updateLocalBalance()
    // await isEntry()
    // await updateBalance()
    // iteration()


    // test
    // await updateBalance()
    // isEntry()
    // createLimitOrder('SHORT', 1700)
    // cancelLimitOrderById('965397156')

}

async function iteration() {
    // console.log('start iteration')
    // check entry
    console.log('wallet', wallet, new Date())
    let { price, error: getPriceError } = await getCurrentPrice()
    if (getPriceError) {
        console.log('cannot get current price')
        return waitIteration()
    }
    if (await isEntry()) {
        // await entryHandle(price)
        return waitIteration()
    }
    await updateLocalBalance()
    resetVariables()
    await createEntry(price)
    return waitIteration()
}

function waitIteration(step = ITERATION_STEP) {
    setTimeout(() => {
        iteration()
    }, step)
}

async function entryHandle(price){
    if(entry1){
        await trailing1(price)
    }
    
    if(entry2){
        await trailing2(price)
    }
}

async function trailing1(price) {   
    let initialThreshold = stoplossOrder2.stopPrice
    let trailingOffset = Math.abs(createInitalStoploss(initialThreshold, -0.02, LEVERAGE, 'long') - initialThreshold)
    if (stoplossOrder1.stopPrice !== trailingThreshold1) {
        trailingThreshold1 = initialThreshold
        trailingOffset = 0
    } 
    
    if (price >= (trailingThreshold1 + trailingOffset)) {
        trailingThreshold1  = price
        await cancelLimitOrderById(stoplossOrder1?.orderId)
        stoplossOrder1 = await createStoplossOrder('LONG', trailingThreshold1)
        console.log('increase trailing long', {price, entryPrice: entry1?.entryPrice, stoplossOrder: stoplossOrder1?.orderId, currentTime: new Date()})
    }
}

async function trailing2(price) {    
    let initialThreshold = stoplossOrder1.stopPrice
    let trailingOffset = Math.abs(createInitalStoploss(initialThreshold, -0.02, LEVERAGE, 'short') - initialThreshold)
    if (stoplossOrder2.stopPrice !== trailingThreshold2) {
        trailingThreshold2 = initialThreshold
        trailingOffset = 0
    } 
    if (price <= (trailingThreshold2 - trailingOffset)) {
        trailingThreshold2  = price
        await cancelLimitOrderById(stoplossOrder2?.orderId)
        stoplossOrder2 = await createStoplossOrder('SHORT', trailingThreshold2)
        console.log('increase trailing short', {price, entryPrice: entry2?.entryPrice, stoplossOrder: stoplossOrder2?.orderId, currentTime: new Date()})
    }
}

async function createEntry(price){
    const quantity = binanceusdm.amountToPrecision(SYMBOL, wallet/2 * LEVERAGE * 0.95 / price)
    await Promise.all([
        binanceusdm.fapiPrivatePostOrder(
            {
                symbol: SYMBOL,
                side: 'BUY',
                positionSide:'LONG',
                type: 'MARKET',
                quantity,
            }
        ),
        binanceusdm.fapiPrivatePostOrder(
            {
                symbol: SYMBOL,
                side: 'SELL',
                positionSide:'SHORT',
                type: 'MARKET',
                quantity,
            }
        )
    ])
    
    if(!await isEntry()){
        throw('Error create entry')
    }
    try{
        const orders = await Promise.all([
            createStoplossOrder('LONG', createInitalStoploss(entry1.entryPrice, 0.04, LEVERAGE, 'long')),
            createStoplossOrder('SHORT', createInitalStoploss(entry2.entryPrice, 0.04, LEVERAGE, 'short')),
            // createTakeProfitOrder('LONG', createInitalStoploss(entry1.entryPrice, -0.055, LEVERAGE, 'long')),
            // createTakeProfitOrder('SHORT', createInitalStoploss(entry2.entryPrice, -0.055, LEVERAGE, 'short')),
            createTrailingOrder('LONG', createInitalStoploss(entry1.entryPrice, -0.045, LEVERAGE, 'long')),
            createTrailingOrder('SHORT', createInitalStoploss(entry2.entryPrice, -0.045, LEVERAGE, 'short'))
        ])
        stoplossOrder1 = orders[0]
        stoplossOrder2 = orders[1]
        trailingOrder1 = orders[2]
        trailingOrder2 = orders[3]
        // takeProfitOrder1 = orders[2]
        // takeProfitOrder2 = orders[3]        
        console.log('create entry 1 long', {quantity: entry1.positionAmt, entryPrice: entry1.entryPrice, stopLossPrice: stoplossOrder1?.stopPrice, trailing1: trailingOrder1?.activatePrice,  currentTime: new Date()})
        console.log('create entry 2 short', {quantity: entry2.positionAmt, entryPrice: entry2.entryPrice, stoplossPrice: stoplossOrder2?.stopPrice,  trailing2: trailingOrder2?.activatePrice, currentTime: new Date()})
    }
    catch(e){
        console.log(e)
        await closePosition()
    }
}

function resetVariables() {
    entry1 = undefined
    entry2 = undefined
    stoplossOrder1 = undefined
    stoplossOrder2 = undefined
    trailingOrder1 = undefined
    trailingOrder2 = undefined
    takeProfitOrder1 = undefined
    takeProfitOrder2 = undefined
    trailingThreshold1 = 0
    trailingThreshold2 = 0
}

// async function updateBalance() {
//     const accountBalances = await tryFetchBalance()
//     wallet = accountBalances?.USDT?.total || 0
//     console.log('Total USDT', wallet, new Date())
//     wallet = Number(wallet) - preBalance
//     if (wallet < 10) {
//         throw ('Ban xui vl')
//     }
// }
async function updateLocalBalance() {
    console.log('updating balance', {currentTime: new Date(), latestEntryTime})
    if (!latestEntryTime) return
    try {
        const trades = await binanceusdm.fetchMyTrades(SYMBOL, latestEntryTime, undefined, {
            'order': 'desc',
        })
        console.log(trades.map(trade=>{
            return {
                side: trade?.info?.side,
                position:trade?.info?.positionSide,
                profit: trade?.info?.realizedPnl,
                fee: trade.fee?.cost
            }
        }))
        const delta = trades.reduce((total, curr) => {
            return total += Number(curr.info?.realizedPnl || 0) - Number(curr.fee?.cost || 0)
        }, 0)
        if (delta < 0) {
            console.log('loss', { before: wallet, after: wallet + delta })
        } else {
            console.log('profit', { before: wallet, after: wallet + delta })
        }
        wallet += delta
    }
    catch (e) {
        console.log(e)
        return
    }
    if (wallet < 20) {
        throw ('Ban xui vl')
    }
}
async function tryFetchBalance(i = 3) {
    try {
        return await binanceusdm.fetchBalance()
    } catch (e) {
        if (i > 0) {
            return await tryFetchBalance(i - 1)
        }
        throw (e)
    }
}


async function closePosition() {
    try {
        const currentPositions = await binanceusdm.fapiPrivateV2GetPositionRisk({
            symbol: SYMBOL
        })
        let arr = []
        const positionLong = currentPositions.find(position=>position.positionAmt>0)
        const positionShort = currentPositions.find(position=>position.positionAmt<0)
        if(positionLong){
            arr.push(binanceusdm.fapiPrivatePostOrder(
                {
                    symbol: SYMBOL,
                    side: 'SELL',
                    positionSide: 'LONG',
                    type: 'MARKET',
                    quantity: Math.abs(positionLong.positionAmt)
                }
            ))
        }
        if(positionShort){
            arr.push(binanceusdm.fapiPrivatePostOrder(
                {
                    symbol: SYMBOL,
                    side: 'BUY',
                    positionSide: 'SHORT',
                    type: 'MARKET',
                    quantity: Math.abs(positionShort.positionAmt)
                }
            ))
        }
        
        await Promise.all(arr)

    } catch (e) {
        console.log('Cannot close position')
        console.log(e)
    }
    // throw('Loi me roiiiiiiiiiiiiiii')
}

async function 
isEntry() {
    try {
        const currentPositions = await binanceusdm.fapiPrivateV2GetPositionRisk({
            symbol: SYMBOL
        })
        entry1 = currentPositions.find(position => position.positionAmt > 0)
        entry2 = currentPositions.find(position => position.positionAmt < 0)
        // if(entry1 && !entry2){
        //     await cancelLimitOrderById(stoplossOrder1?.orderId)
        //     stoplossOrder1 = await createStoplossOrder('LONG', createInitalStoploss(entry1.entryPrice, -0.035, LEVERAGE, 'long'))
        //     console.log('update stoploss order long', {entryPrice: entry1.entryPrice, stopPrice: stoplossOrder1?.stopPrice})
        // }
        // if(entry2 && !entry1){
        //     await cancelLimitOrderById(stoplossOrder2?.orderId)
        //     stoplossOrder2 = await createStoplossOrder('SHORT', createInitalStoploss(entry2.entryPrice, -0.035, LEVERAGE, 'short'))
        //     console.log('update stoploss order short', {entryPrice: entry2.entryPrice, stopPrice: stoplossOrder2?.stopPrice})
        // }
        // if(!entry1 && trailingOrder1){
        //     const result = await cancelLimitOrderById(trailingOrder1?.orderId)
        //     if(result){trailingOrder1 = undefined}
        // }
        // if(!entry2 && trailingOrder2){
        //     const result = await cancelLimitOrderById(trailingOrder2?.orderId)
        //     if(result){trailingOrder2 = undefined}
        // }
        if(entry1?.updateTime && entry2?.updateTime){
            latestEntryTime = Math.min(entry1.updateTime, entry2.updateTime)
        }
        if(!entry1 && !entry2){
            try{
                await binanceusdm.fapiPrivateDeleteAllOpenOrders({
                    symbol: SYMBOL
                })
            } catch(e){
                console.log(e)
                throw('Huy ngayyyyyyyyyyyyyyyy')
            }
        }
        return !!entry1 || !!entry2
    } catch (e) {
        console.log('Cannot get entry information')
        console.log(e)
        return false
    }
}

async function cancelLimitOrderById(orderId) {
    if (!orderId) return
    try {
        await binanceusdm.fapiPrivateDeleteOrder({
            symbol: SYMBOL,
            orderId
        })
        return true

    } catch (e) {
        console.log('ERROR --------------------')
        console.log(e)
    }
}

async function setupFuture() {
    await binanceusdm.loadMarkets()
    const { dualSidePosition } = await binanceusdm.fapiPrivateGetPositionSideDual()
    if (!dualSidePosition) {
        try {
            await binanceusdm.fapiPrivatePostPositionSideDual({ dualSidePosition: true })
        }
        catch (e) {
            console.log(e)
            return false
        }
    }
    try {
        await binanceusdm.fapiPrivatePostMarginType({ symbol: SYMBOL, marginType: 'ISOLATED' })
    } catch (e) {
    }
    try {
        await binanceusdm.fapiPrivatePostLeverage({ symbol: SYMBOL, leverage: LEVERAGE })
    } catch (e) {
    }
}
async function getCurrentPrice() {
    try {
        const {close} = await binance.fetchTicker(SYMBOL)
        return {price:close}
    }
    catch (e) {
        console.log(e)
        return { error: e }
    }
}

async function createStoplossOrder(signal, price) {
    const limitPrice = Number(binanceusdm.priceToPrecision(SYMBOL, price))
    try {
        return await binanceusdm.fapiPrivatePostOrder(
            {
                symbol: SYMBOL,
                side: signal === 'SHORT' ? 'BUY' : 'SELL',
                positionSide: signal,
                type: 'STOP_MARKET',
                closePosition: 'true',
                stopPrice: limitPrice
            }
        )
    } catch (e) {
        console.log('ERROR --------------------', { stopPrice: limitPrice, signal, currentTime: new Date() })
        console.log(e)
        await closePosition()
    }
    return
}

async function createTakeProfitOrder(signal, price) {
    const limitPrice = Number(binanceusdm.priceToPrecision(SYMBOL, price))
    try {
        return await binanceusdm.fapiPrivatePostOrder(
            {
                symbol: SYMBOL,
                side: signal === 'SHORT' ? 'BUY' : 'SELL',
                positionSide: signal,
                type: 'TAKE_PROFIT_MARKET',
                closePosition: 'true',
                stopPrice: limitPrice
            }
        )
    } catch (e) {
        console.log('ERROR --------------------', { stopPrice: limitPrice, signal, currentTime: new Date() })
        console.log(e)
        await closePosition()
    }
    return
}

async function createTrailingOrder(signal, price) {
    const limitPrice = Number(binanceusdm.priceToPrecision(SYMBOL, price))
    try {
        return await binanceusdm.fapiPrivatePostOrder(
            {
                symbol: SYMBOL,
                side: signal === 'SHORT' ? 'BUY' : 'SELL',
                positionSide: signal,
                type: 'TRAILING_STOP_MARKET',
                activationPrice: limitPrice,
                callbackRate: 0.1,
                quantity: Math.abs(entry1.positionAmt)
            }
        )
    } catch (e) {
        console.log('ERROR --------------------', { stopPrice: limitPrice, signal, currentTime: new Date() })
        console.log(e)
        await closePosition()
    }
    return
}




function createInitalStoploss(price, _stoplossPercent, _leverage = LEVERAGE, initialPosition) {
    return (-1 * _stoplossPercent / _leverage * (initialPosition === 'long' ? 1 : -1) + 1) * price
}
