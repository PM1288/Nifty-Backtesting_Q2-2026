package universe

import (
	"encoding/csv"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Constituent struct {
	Symbol        string
	CompanyName   string
	Industry      string
	Sector        string
	MacroSector   string
	BasicIndustry string
	Series        string
	ISIN          string
	Weight        *float64
}

func ParseConstituentsCSV(path string) ([]Constituent, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open constituents csv: %w", err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("read constituents csv: %w", err)
	}
	if len(rows) == 0 {
		return nil, nil
	}

	header := map[string]int{}
	for i, cell := range rows[0] {
		key := strings.ToLower(strings.TrimSpace(cell))
		if key != "" {
			header[key] = i
		}
	}
	startRow := 0
	if len(header) > 0 {
		startRow = 1
	}

	idxSymbol := findHeaderIndex(header, "symbol", "symbols")
	idxCompany := findHeaderIndex(header, "company name", "company", "company_name", "name")
	idxIndustry := findHeaderIndex(header, "industry")
	idxSector := findHeaderIndex(header, "sector")
	idxMacro := findHeaderIndex(header, "macro sector", "macro_sector", "macrosector")
	idxBasic := findHeaderIndex(header, "basic industry", "basic_industry", "basicindustry")
	idxSeries := findHeaderIndex(header, "series")
	idxISIN := findHeaderIndex(header, "isin code", "isin", "isin_code")
	idxWeight := findHeaderIndex(header, "weight", "weightage", "weight (%)", "weight_percent")

	out := make([]Constituent, 0, len(rows))
	for _, row := range rows[startRow:] {
		if len(row) == 0 {
			continue
		}
		symbol := pickCell(row, idxSymbol)
		if symbol == "" {
			symbol = firstNonEmpty(row)
		}
		symbol = strings.ToUpper(strings.TrimSpace(symbol))
		if symbol == "" || strings.HasPrefix(symbol, "DUMMY") {
			continue
		}
		if symbol == "SYMBOL" || symbol == "SYMBOLS" {
			continue
		}
		constituent := Constituent{
			Symbol:        symbol,
			CompanyName:   pickCell(row, idxCompany),
			Industry:      pickCell(row, idxIndustry),
			Sector:        pickCell(row, idxSector),
			MacroSector:   pickCell(row, idxMacro),
			BasicIndustry: pickCell(row, idxBasic),
			Series:        pickCell(row, idxSeries),
			ISIN:          pickCell(row, idxISIN),
		}
		if weight := parseWeight(pickCell(row, idxWeight)); weight != nil {
			constituent.Weight = weight
		}
		out = append(out, fillConstituentFallbacks(constituent))
	}
	return out, nil
}

func findHeaderIndex(header map[string]int, keys ...string) int {
	for _, key := range keys {
		if idx, ok := header[strings.ToLower(strings.TrimSpace(key))]; ok {
			return idx
		}
	}
	return -1
}

func pickCell(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

func firstNonEmpty(row []string) string {
	for _, cell := range row {
		cell = strings.TrimSpace(cell)
		if cell != "" {
			return cell
		}
	}
	return ""
}

func parseWeight(value string) *float64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	value = strings.TrimSuffix(value, "%")
	value = strings.ReplaceAll(value, ",", "")
	if value == "" {
		return nil
	}
	f, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil
	}
	return &f
}

func fillConstituentFallbacks(c Constituent) Constituent {
	fallback := strings.TrimSpace(c.Industry)
	if fallback == "" {
		fallback = strings.TrimSpace(c.Sector)
	}
	if fallback == "" {
		fallback = strings.TrimSpace(c.MacroSector)
	}
	if fallback == "" {
		fallback = "Unknown"
	}
	if strings.TrimSpace(c.Sector) == "" {
		c.Sector = fallback
	}
	if strings.TrimSpace(c.MacroSector) == "" {
		c.MacroSector = fallback
	}
	if strings.TrimSpace(c.BasicIndustry) == "" {
		c.BasicIndustry = fallback
	}
	if strings.TrimSpace(c.Industry) == "" {
		c.Industry = fallback
	}
	return c
}
