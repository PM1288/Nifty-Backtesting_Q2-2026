package backtest

import "math"

type ChargeBreakdown struct {
	EntryValue      float64
	ExitValue       float64
	Turnover        float64
	GrossProfit     float64
	BrokerageEntry  float64
	BrokerageExit   float64
	BrokerageTotal  float64
	STT             float64
	ExchangeTxn     float64
	SEBIFee         float64
	StampDuty       float64
	GST             float64
	TotalCharges    float64
	NetProfit       float64
	NetGainPct      float64
	BreakevenPoints float64
}

func CalculateTradeCosts(entryPrice, exitPrice float64, quantity int, rates ChargeRates) ChargeBreakdown {
	qty := quantity
	if qty < 0 {
		qty = 0
	}
	entryValue := round2(entryPrice * float64(qty))
	exitValue := round2(exitPrice * float64(qty))
	turnover := round2(entryValue + exitValue)

	brokerageEntry := 0.0
	if entryValue > 0 {
		brokerageEntry = math.Min(entryValue*rates.BrokerageRate, rates.BrokerageCap)
	}
	brokerageExit := 0.0
	if exitValue > 0 {
		brokerageExit = math.Min(exitValue*rates.BrokerageRate, rates.BrokerageCap)
	}
	brokerageTotal := brokerageEntry + brokerageExit

	stt := exitValue * rates.STTRate
	exchangeTxn := turnover * rates.ExchangeTxnRate
	sebiFee := turnover * rates.SEBIFeeRate
	stampDuty := entryValue * rates.StampDutyRate
	gstBase := brokerageTotal + exchangeTxn + sebiFee
	gst := gstBase * rates.GSTRate

	brokerageEntry = round2(brokerageEntry)
	brokerageExit = round2(brokerageExit)
	brokerageTotal = round2(brokerageEntry + brokerageExit)
	stt = round2(stt)
	exchangeTxn = round2(exchangeTxn)
	sebiFee = round2(sebiFee)
	stampDuty = round2(stampDuty)
	gst = round2(gst)

	totalCharges := round2(brokerageTotal + stt + exchangeTxn + sebiFee + stampDuty + gst)
	grossProfit := round2(exitValue - entryValue)
	netProfit := round2(grossProfit - totalCharges)
	netGainPct := round4(0)
	if entryValue > 0 {
		netGainPct = round4((netProfit / entryValue) * 100)
	}
	breakevenPoints := 0.0
	if qty > 0 {
		breakevenPoints = round4(totalCharges / float64(qty))
	}

	return ChargeBreakdown{
		EntryValue:      entryValue,
		ExitValue:       exitValue,
		Turnover:        turnover,
		GrossProfit:     grossProfit,
		BrokerageEntry:  brokerageEntry,
		BrokerageExit:   brokerageExit,
		BrokerageTotal:  brokerageTotal,
		STT:             stt,
		ExchangeTxn:     exchangeTxn,
		SEBIFee:         sebiFee,
		StampDuty:       stampDuty,
		GST:             gst,
		TotalCharges:    totalCharges,
		NetProfit:       netProfit,
		NetGainPct:      netGainPct,
		BreakevenPoints: breakevenPoints,
	}
}

func round2(value float64) float64 {
	return math.Round(value*100) / 100
}

func round4(value float64) float64 {
	return math.Round(value*10000) / 10000
}
