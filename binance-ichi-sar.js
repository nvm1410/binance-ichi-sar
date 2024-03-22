const ccxt = require('ccxt')
let entry
let stoplossOrder
let currentPosition
let wallet = 20
let LEVERAGE = 10
let latestEntryTime
let hasUpdateThisEntry = true
const INTERVAL = '1h'
const SYMBOL = 'ETHUSDT'
const ITERATION_STEP = 5000
const START_SAR = 1630.11
const START_EXTREME = 1677.74
const IS_RISING = true
const START_DATE = '2023-03-02T00:00:00.000Z'
const ACC__START = 0.02
const ACC_INCR = 0.02
const ACC_MAX = 0.2
const STOPLOSS_RATE = 0.1
const LIQUIDATED_STOPLOSS_RATE = 0.7

const binanceusdm = new ccxt.binanceusdm({
    'apiKey': 'NouLnleEVV4dR6B9sLsYRZEOCRY49cqkILWkYqx699RXvzzjSPUq6fI9i1g3PJ4Z',
    'secret': '5tbxJ2OgSkMhFWVhxOrIM2j5VqZZLWlTmuTmMgHq1PfWd1If6ADcPuPjsyqpHzJB',
})
const binance = new ccxt.binanceusdm();



main()

async function main() {
    console.log('run')
    await setupFuture()
    iteration()
    // console.log(await binanceusdm.fetchMyTrades(SYMBOL, new Date('2023-03-22T18:00:02.800Z').getTime(), undefined, {
    //     'order': 'desc',
    // }))
    // console.log(await binanceusdm.fapiPrivateV2GetPositionRisk({
    //     symbol: SYMBOL
    // }))
    // await binanceusdm.fapiPrivateDeleteAllOpenOrders({
    //     symbol: SYMBOL
    // })
    // console.log(await closeAllPositions())
    // console.log(await calculateParabolicSAR(START_SAR, START_EXTREME, IS_RISING, START_DATE))
    // console.log(await binanceusdm.fetchBalance())
}

async function iteration() {
    console.log('wallet', wallet, new Date())
    if (await isEntry()) {
        await entryHandle()
        return waitIteration()
    }
    await updateLocalBalance()
    resetVariables()
    await createEntry()
    return waitIteration()
}

function waitIteration(step = ITERATION_STEP) {
    setTimeout(() => {
        iteration()
    }, step)
}
function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function isEntry() {
    try {
        const currentPositions = await binanceusdm.fapiPrivateV2GetPositionRisk({
            symbol: SYMBOL
        })
        entry = currentPositions.find(position => currentPosition === 'LONG' ? position.positionAmt > 0 : position.positionAmt < 0)
        if(entry?.updateTime){
            latestEntryTime = entry.updateTime
        }
        if(!entry){
            try{
                await binanceusdm.fapiPrivateDeleteAllOpenOrders({
                    symbol: SYMBOL
                })
            } catch(e){
                console.log(e)
                throw('Huy ngayyyyyyyyyyyyyyyy')
            }
        }
        return !!entry
    } catch (e) {
        console.log('Cannot get entry information')
        console.log(e)
        await timeout(5000)
        return await isEntry()
    }
}

async function entryHandle(repeat = 3){
    console.log('entry handle repeat', repeat)
    if(repeat <= 0){
        closeEverythingAndThrow()
        return
    }
    let {sar, isRising, date} = await calculateParabolicSAR()
    if(get1h(new Date().toISOString(), 1) !== date) {
        console.log('Sar chưa cập nhật kịp, đã vào lệnh')
        await timeout(5000)
        return entryHandle(repeat-1)
    }
    const isCloseSignal = (currentPosition === 'LONG' && isRising === false) || (currentPosition === 'SHORT' && isRising === true)
    if(isCloseSignal){
        await closePosition(currentPosition, Math.abs(entry.positionAmt))
        console.log('close by parabolic SAR signal', currentPosition, new Date())
        return
    }
    await trailing(sar)
}

async function ichimokuEnterSignal(){
    let ichimokuSignal
    try {
        ichimokuSignal = await calculateIchimoku()
    } catch (e){
        console.log(e)
        return
    }
    const {currentIchimoku, prevIchimoku} = ichimokuSignal
    const {close, leadingSpanA, leadingSpanB, conversionLine, baseLine, date} = currentIchimoku
    if(get1h(new Date().toISOString(), 1) !== date) {
        console.log('Ichimoku chưa cập nhật kịp')
        return
    }
    
    const {isRising, date: sarDate} = await calculateParabolicSAR() 
    if(get1h(new Date().toISOString(), 1) !== sarDate) {
        console.log('Sar chưa cập nhật kịp')
        return
    }
    if(isRising == undefined) return
    let validate = false
    if(
        close<Math.min(leadingSpanA, leadingSpanB) 
        || close>Math.max(leadingSpanA, leadingSpanB)
    ){
        validate = true
    } 
    if(!validate) return
    if(
        prevIchimoku.conversionLine > prevIchimoku.baseLine
        && conversionLine < baseLine
        && close<Math.min(leadingSpanA, leadingSpanB)
        && isRising === false
    ){
        return 'SHORT'
    }
    if(
        prevIchimoku.conversionLine < prevIchimoku.baseLine
        && conversionLine > baseLine
        && close>Math.max(leadingSpanA, leadingSpanB)
        && isRising === true
    ){
        return 'LONG'
    }
    return
}

async function trailing(sar) {
    if(!sar) return
    if(!stoplossOrder?.stopPrice){
        console.log('không tìm được giá cắt lỗ')
        return
    }
    const sarToPrecision = Number(binanceusdm.priceToPrecision(SYMBOL, sar))
    const stopLossPriceToPrecision = Number(binanceusdm.priceToPrecision(SYMBOL, stoplossOrder.stopPrice))
    console.log('compare', {sarToPrecision, stopLossPriceToPrecision, currentPosition})
    const isTrailing = (currentPosition === 'LONG' && sarToPrecision > stopLossPriceToPrecision) || (currentPosition === 'SHORT' && sarToPrecision < stopLossPriceToPrecision)
    if(!isTrailing) return
    await cancelLimitOrderById(stoplossOrder?.orderId)
    stoplossOrder = await createStoplossOrder(currentPosition, sar),
    console.log('trailing', 
    {
        position: currentPosition,
        stopLossPrice: stoplossOrder?.stopPrice,
        currentTime: new Date()
    })
}


function get1h(date, offset=0){
    const dateTime = new Date(date)
    dateTime.setHours(dateTime.getHours()-offset)
    dateTime.setMinutes(0)
    dateTime.setSeconds(0)
    dateTime.setMilliseconds(0)
    const str = dateTime.toISOString()
    return str
}

async function createEntry(){
    if(latestEntryTime){
        const isoNow = new Date().toISOString()
        const isoLastEntry = new Date(Number(latestEntryTime)).toISOString()
        if(get1h(isoNow) === get1h(isoLastEntry)){
            console.log('vào lệnh chưa đủ 1 tiếng', {latestEntryTime: isoLastEntry, now:isoNow})
            return
        }  
    }
    let { price, error: getPriceError } = await getCurrentPrice()
    if (getPriceError) {
        console.log('cannot get current price')
        return
    }
    currentPosition = await ichimokuEnterSignal()
    if(!currentPosition) {
        console.log('chưa có tín hiệu')
        return
    }
    const {sar} = await calculateParabolicSAR()
    if(!sar) {
        console.log('lỗi lấy stoploss, không vào lệnh')
        return
    }
    let entryUSDT = Math.abs(STOPLOSS_RATE/LEVERAGE * wallet / (sar/price - 1))
    entryUSDT = Math.min(entryUSDT, wallet)
    const quantity = binanceusdm.amountToPrecision(SYMBOL, entryUSDT * LEVERAGE * 0.95 / price)
    
    await binanceusdm.fapiPrivatePostOrder(
        {
            symbol: SYMBOL,
            side: currentPosition === 'SHORT' ? 'SELL' : 'BUY',
            positionSide: currentPosition,
            type: 'MARKET',
            quantity,
        }
    ) 
    if(!await isEntry()){
        throw('Error create entry')
    }
    const liquidatedStoplossPrice = createInitalStoploss(entry.entryPrice, LIQUIDATED_STOPLOSS_RATE, LEVERAGE, currentPosition)
    let stoplossPrice = liquidatedStoplossPrice
    if(currentPosition === 'LONG' && sar < price && sar > liquidatedStoplossPrice){
        stoplossPrice = sar
    }
    if(currentPosition === 'SHORT' && sar > price && sar < liquidatedStoplossPrice){
        stoplossPrice = sar
    }
    stoplossOrder = await createStoplossOrder(currentPosition, stoplossPrice)
    hasUpdateThisEntry = false
    console.log('create entry', 
    {
            position: currentPosition,
            quantity: entry.positionAmt, 
            entryPrice: entry.entryPrice, 
            stopLossPrice: stoplossOrder?.stopPrice,
            liquidatedStoplossPrice,
            currentTime: new Date()
    })
}

function resetVariables() {
    entry = undefined
    stoplossOrder = undefined
    currentPosition = undefined
    trailingRate = INITIAL_TRAILING_RATE
}


async function updateLocalBalance() {
    if (!latestEntryTime || hasUpdateThisEntry) return
    console.log('updating balance', {currentTime: new Date(), latestEntryTime, latestEntryTimeISO: latestEntryTime && new Date(Number(latestEntryTime))})
    try {
        let trades = await binanceusdm.fetchMyTrades(SYMBOL, latestEntryTime, undefined, {
            'order': 'desc',
        })
        if(!trades.find(trade=>trade?.info?.side === 'SELL') || !trades.find(trade=>trade?.info?.side === 'BUY')){
            console.log('chưa đủ thông tin để cập nhật balance')
            await timeout(5000)
            trades = await binanceusdm.fetchMyTrades(SYMBOL, latestEntryTime, undefined, {
                'order': 'desc',
            })
        }
        console.log(trades.map(trade=>{
            return `side: ${trade?.info?.side}, position: ${trade?.info?.positionSide}, profit: ${trade?.info?.realizedPnl}, fee: ${trade.fee?.cost}`
        }))
        const delta = trades.reduce((total, curr) => {
            return total += Number(curr.info?.realizedPnl || 0) - Number(curr.fee?.cost || 0)
        }, 0)
        if (delta < 0) {
            console.log('loss', { delta, before: wallet, after: wallet + delta, changeRate: `${Number(delta)/Number(wallet)*100}%` })
        } else {
            console.log('profit', { delta, before: wallet, after: wallet + delta, changeRate: `${Number(delta)/Number(wallet)*100}%` })
        }
        wallet += delta
        hasUpdateThisEntry = true
    }
    catch (e) {
        console.log(e)
        return
    }
    if (wallet < 10) {
        throw ('Ban xui vl')
    }
}

async function closePosition(positionSide, quantity){
    return await binanceusdm.fapiPrivatePostOrder(
        {
            symbol: SYMBOL,
            side: positionSide === 'LONG' ? 'SELL' : 'BUY',
            positionSide,
            type: 'MARKET',
            quantity
        }
    )
}

async function closeAllPositions() {
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
        await closeAllPositions()
    }
    return
}

function createInitalStoploss(price, _stoplossPercent, _leverage = LEVERAGE, initialPosition) {
    return (-1 * _stoplossPercent / _leverage * (initialPosition === 'LONG' ? 1 : -1) + 1) * price
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

async function calculateIchimoku() {
    const conversionPeriods = 9;
    const basePeriods = 26;
    const spanBPeriods = 52;
    const displacement = 26;

    const data = (await binance.fetchOHLCV(SYMBOL, INTERVAL, undefined, 120)).map(x=>({
        open: x[1],
        high: x[2],
        low: x[3],
        close: x[4],
        date: new Date(x[0]).toISOString()
    }))
    // console.log(data)
    // Calculate Conversion Line (Tenkan-sen)
    const conversionLine = [];
    for (let i = 0; i < data.length; i++) {
      if (i < conversionPeriods - 1) {
        conversionLine.push(null);
        continue;
      }
  
      const highSlice = data.slice(i - conversionPeriods + 1, i + 1).map(d => d.high);
      const lowSlice = data.slice(i - conversionPeriods + 1, i + 1).map(d => d.low);
      const high = Math.max(...highSlice);
      const low = Math.min(...lowSlice);
      conversionLine.push((high + low) / 2);
    }
  
    // Calculate Base Line (Kijun-sen)
    const baseLine = [];
    for (let i = 0; i < data.length; i++) {
      if (i < basePeriods - 1) {
        baseLine.push(null);
        continue;
      }
  
      const highSlice = data.slice(i - basePeriods + 1, i + 1).map(d => d.high);
      const lowSlice = data.slice(i - basePeriods + 1, i + 1).map(d => d.low);
      const high = Math.max(...highSlice);
      const low = Math.min(...lowSlice);
      baseLine.push((high + low) / 2);
    }
  
    // Calculate Leading Span A (Senkou Span A)
    const leadingSpanA = [];
    for (let i = 0; i < data.length; i++) {
      if (i < basePeriods - 1 + displacement) {
        leadingSpanA.push(null);
        continue;
      }
  
      const conversion = conversionLine[i - displacement+1];
      const base = baseLine[i - displacement+1];
      leadingSpanA.push((conversion + base) / 2);
    }
  
    // Calculate Leading Span B (Senkou Span B)
    const leadingSpanB = [];
    leadingSpanB.push(...new Array(25).fill(null))
    for (let i = 0; i < data.length; i++) {
      if (i < spanBPeriods - 1 + displacement) {
        leadingSpanB.push(null);
        continue;
      }
      const highSlice = data.slice(i - spanBPeriods + 1, i + 1).map(d => d.high);
      const lowSlice = data.slice(i - spanBPeriods + 1, i + 1).map(d => d.low);
      const high = Math.max(...highSlice);
      const low = Math.min(...lowSlice);
      leadingSpanB.push((high + low) / 2);
    }
    const returnData = {
        currentIchimoku: {
          baseLine: baseLine[baseLine.length-2],
          conversionLine: conversionLine[conversionLine.length-2],
          leadingSpanA: leadingSpanA[leadingSpanA.length-2],
          leadingSpanB: leadingSpanB[leadingSpanB.length-2-25],
          close: data[data.length-2].close,
          date: data[data.length-2].date
        },
        prevIchimoku: {
          baseLine: baseLine[baseLine.length-3],
          conversionLine: conversionLine[conversionLine.length-3],
          leadingSpanA: leadingSpanA[leadingSpanA.length-3],
          leadingSpanB: leadingSpanB[leadingSpanB.length-3-25],
          close: data[data.length-3].close,
          date: data[data.length-3].date
        },
      };
      console.log('prev and current ichimoku', returnData)
    return returnData
  }

async function calculateParabolicSAR(startSAR = START_SAR, startExtreme=START_EXTREME, startRising = IS_RISING, startDate=START_DATE) {
    let data = []
    try {
        data = (await binance.fetchOHLCV(SYMBOL, INTERVAL, new Date(startDate).getTime())).map(x=>({
            open: x[1],
            high: x[2],
            low: x[3],
            close: x[4],
            date: new Date(x[0]).toISOString()
        }))
    } catch(e){
        console.log(e)
        return {}
    }
    let highs = data.map(e=>e.high)
    let lows = data.map(e=>e.low)
    const numDataPoints = highs.length;
    let currentSAR = startSAR
    let currentExtreme = startExtreme
    let accelerationFactor = ACC__START;
    let isRising = startRising;
  
    for (let i = 1; i < numDataPoints; i++) {
      if (isRising) {
        currentSAR = currentSAR + accelerationFactor * (currentExtreme - currentSAR);
        if (lows[i] < currentSAR) {
          isRising = false;
          currentSAR = currentExtreme;
          currentExtreme = lows[i]
          accelerationFactor = ACC__START;
        } else {
          if (highs[i] > currentExtreme) {
            currentExtreme = highs[i];
            accelerationFactor = Math.min(accelerationFactor + ACC_INCR, ACC_MAX);
          }
          currentSAR = Math.min(...[currentSAR, lows[i-1], lows[i-2]].filter(x=>Number.isFinite(x)))
        }
      } else {
        currentSAR = currentSAR - accelerationFactor * (currentSAR - currentExtreme);
        if (highs[i] > currentSAR) {
          isRising = true;
          currentSAR = currentExtreme;
          currentExtreme = highs[i]
          accelerationFactor = ACC__START;
        } else {
          if (lows[i] < currentExtreme) {
            currentExtreme = lows[i];
            accelerationFactor = Math.min(accelerationFactor + ACC_INCR, ACC_MAX);
          }
          currentSAR = Math.max(...[currentSAR, highs[i-1], highs[i-2]].filter(x=>Number.isFinite(x)))
        }
      }
      data[i].sar = currentSAR
      data[i].isRising = isRising
    }
    const returnData = data[data.length-2] || {}
    console.log('current sar', {isRising:returnData.isRising, sar:returnData.sar, date:returnData.date})
    return returnData
  }

  async function closeEverythingAndThrow(){
    console.log('try to close everything')
    await closeAllPositions()
    await binanceusdm.fapiPrivateDeleteAllOpenOrders({
            symbol: SYMBOL
    })
    throw('-------------------The end-------------------')
  }
