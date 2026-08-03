package parameters

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"trading-stack/internal/store"
)

type Value struct {
	Raw json.RawMessage
}

func EnsureScope(ctx context.Context, st *store.Store, scope string, defs []Definition, updatedBy string) error {
	if st == nil || len(defs) == 0 {
		return nil
	}
	seeds := make([]store.StrategyParameterSeed, 0, len(defs))
	for _, def := range defs {
		raw, err := json.Marshal(def.Default)
		if err != nil {
			continue
		}
		seeds = append(seeds, store.StrategyParameterSeed{Name: def.Name, Value: raw})
	}
	var updatedByPtr *string
	if strings.TrimSpace(updatedBy) != "" {
		updatedByPtr = &updatedBy
	}
	return st.EnsureStrategyParameters(ctx, scope, seeds, updatedByPtr)
}

func LoadScope(ctx context.Context, st *store.Store, scope string, defs []Definition, updatedBy string) (map[string]Value, error) {
	if err := EnsureScope(ctx, st, scope, defs, updatedBy); err != nil {
		return nil, err
	}
	params, err := st.ListStrategyParameters(ctx, scope)
	if err != nil {
		return nil, err
	}
	out := make(map[string]Value, len(params))
	for name, param := range params {
		out[name] = Value{Raw: param.Value}
	}
	return out, nil
}

func ParseValue(def Definition, raw json.RawMessage) (any, error) {
	val := Value{Raw: raw}
	switch def.Kind {
	case KindInt:
		if v, ok := val.Int(); ok {
			return v, nil
		}
	case KindNumber:
		if v, ok := val.Float64(); ok {
			return v, nil
		}
	case KindBool:
		if v, ok := val.Bool(); ok {
			return v, nil
		}
	case KindString:
		if v, ok := val.String(); ok {
			return v, nil
		}
	}
	return nil, fmt.Errorf("invalid value for %s", def.Name)
}

func NormalizeValue(def Definition, raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		return nil, errors.New("value is required")
	}
	var input any
	if err := json.Unmarshal(raw, &input); err != nil {
		return nil, err
	}
	switch def.Kind {
	case KindBool:
		parsed, ok := coerceBool(input)
		if !ok {
			return nil, errors.New("expected boolean value")
		}
		return json.Marshal(parsed)
	case KindInt:
		parsed, ok := coerceFloat(input)
		if !ok || math.Trunc(parsed) != parsed {
			return nil, errors.New("expected integer value")
		}
		if err := validateRange(def, parsed); err != nil {
			return nil, err
		}
		return json.Marshal(int(parsed))
	case KindNumber:
		parsed, ok := coerceFloat(input)
		if !ok {
			return nil, errors.New("expected numeric value")
		}
		if err := validateRange(def, parsed); err != nil {
			return nil, err
		}
		return json.Marshal(parsed)
	case KindString:
		parsed, ok := coerceString(input)
		if !ok {
			return nil, errors.New("expected string value")
		}
		return json.Marshal(parsed)
	default:
		return nil, errors.New("unsupported parameter type")
	}
}

func validateRange(def Definition, value float64) error {
	if def.Min != nil && value < *def.Min {
		return fmt.Errorf("%s must be >= %v", def.Name, *def.Min)
	}
	if def.Max != nil && value > *def.Max {
		return fmt.Errorf("%s must be <= %v", def.Name, *def.Max)
	}
	return nil
}

func (v Value) Float64() (float64, bool) {
	if len(v.Raw) == 0 {
		return 0, false
	}
	var num float64
	if err := json.Unmarshal(v.Raw, &num); err == nil {
		return num, true
	}
	var str string
	if err := json.Unmarshal(v.Raw, &str); err == nil {
		parsed, err := strconv.ParseFloat(strings.TrimSpace(str), 64)
		if err == nil {
			return parsed, true
		}
	}
	return 0, false
}

func (v Value) Int() (int, bool) {
	if len(v.Raw) == 0 {
		return 0, false
	}
	var intval int
	if err := json.Unmarshal(v.Raw, &intval); err == nil {
		return intval, true
	}
	if num, ok := v.Float64(); ok {
		if math.Trunc(num) != num {
			return 0, false
		}
		return int(num), true
	}
	return 0, false
}

func (v Value) Bool() (bool, bool) {
	if len(v.Raw) == 0 {
		return false, false
	}
	var b bool
	if err := json.Unmarshal(v.Raw, &b); err == nil {
		return b, true
	}
	var str string
	if err := json.Unmarshal(v.Raw, &str); err == nil {
		str = strings.TrimSpace(strings.ToLower(str))
		if str == "true" || str == "1" || str == "yes" {
			return true, true
		}
		if str == "false" || str == "0" || str == "no" {
			return false, true
		}
	}
	return false, false
}

func (v Value) String() (string, bool) {
	if len(v.Raw) == 0 {
		return "", false
	}
	var str string
	if err := json.Unmarshal(v.Raw, &str); err == nil {
		return strings.TrimSpace(str), true
	}
	return "", false
}

func coerceFloat(input any) (float64, bool) {
	switch v := input.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err == nil {
			return parsed, true
		}
	}
	return 0, false
}

func coerceBool(input any) (bool, bool) {
	switch v := input.(type) {
	case bool:
		return v, true
	case string:
		v = strings.TrimSpace(strings.ToLower(v))
		if v == "true" || v == "1" || v == "yes" {
			return true, true
		}
		if v == "false" || v == "0" || v == "no" {
			return false, true
		}
	}
	return false, false
}

func coerceString(input any) (string, bool) {
	switch v := input.(type) {
	case string:
		return strings.TrimSpace(v), true
	default:
		return fmt.Sprint(v), true
	}
}
