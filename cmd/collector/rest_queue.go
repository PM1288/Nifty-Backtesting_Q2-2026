package main

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"trading-stack/internal/ratelimit"
)

type restAttemptContextKey struct{}

func restAttemptFromContext(ctx context.Context) int {
	attempt, _ := ctx.Value(restAttemptContextKey{}).(int)
	return attempt
}

const (
	restMaxAttempts = 3
	restBaseBackoff = time.Second
	restMaxBackoff  = 5 * time.Second
)

type restEndpoint string

const (
	endpointQuote      restEndpoint = "quote"
	endpointCandles    restEndpoint = "candles"
	endpointGreeks     restEndpoint = "greeks"
	endpointAggregates restEndpoint = "aggregates"
)

type jobPriority int

const (
	priorityHigh jobPriority = iota
	priorityLow
)

type restJob struct {
	endpoint restEndpoint
	name     string
	priority jobPriority
	run      func(context.Context) error
	done     chan error
}

type restQueue struct {
	jobsHigh    chan restJob
	jobsLow     chan restJob
	limiters    map[restEndpoint]*ratelimit.AdaptiveLimiter
	capLimiters map[restEndpoint][]*ratelimit.RollingLimiter
	logger      *slog.Logger
}

func newRestQueue(buffer int, limiters map[restEndpoint]*ratelimit.AdaptiveLimiter, caps map[restEndpoint][]*ratelimit.RollingLimiter, logger *slog.Logger) *restQueue {
	if buffer < 1 {
		buffer = 128
	}
	return &restQueue{
		jobsHigh:    make(chan restJob, buffer),
		jobsLow:     make(chan restJob, buffer),
		limiters:    limiters,
		capLimiters: caps,
		logger:      logger,
	}
}

func (q *restQueue) Start(ctx context.Context, workers int) error {
	if workers < 1 {
		return errors.New("rest queue workers must be >= 1")
	}
	for i := 0; i < workers; i++ {
		go q.worker(ctx)
	}
	return nil
}

func (q *restQueue) Submit(job restJob) chan error {
	if job.run == nil {
		ch := make(chan error, 1)
		ch <- errors.New("rest job missing run func")
		close(ch)
		return ch
	}
	if job.done == nil {
		job.done = make(chan error, 1)
	}
	target := q.jobsHigh
	if job.priority == priorityLow {
		target = q.jobsLow
	}
	select {
	case target <- job:
		return job.done
	default:
		if q.logger != nil {
			q.logger.Warn("rest_queue_full", "job", job.name, "endpoint", job.endpoint)
		}
		job.done <- errors.New("rest queue full")
		close(job.done)
		return job.done
	}
}

func (q *restQueue) worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		select {
		case job := <-q.jobsHigh:
			err := q.runJob(ctx, job)
			if job.done != nil {
				job.done <- err
				close(job.done)
			}
		default:
			select {
			case <-ctx.Done():
				return
			case job := <-q.jobsHigh:
				err := q.runJob(ctx, job)
				if job.done != nil {
					job.done <- err
					close(job.done)
				}
			case job := <-q.jobsLow:
				err := q.runJob(ctx, job)
				if job.done != nil {
					job.done <- err
					close(job.done)
				}
			}
		}
	}
}

func (q *restQueue) runJob(ctx context.Context, job restJob) error {
	limiter := q.limiters[job.endpoint]
	var err error
	for attempt := 1; attempt <= restMaxAttempts; attempt++ {
		if limiter != nil {
			if err = limiter.Wait(ctx); err != nil {
				return err
			}
		}
		if capLimiters := q.capLimiters[job.endpoint]; len(capLimiters) > 0 {
			for _, capLimiter := range capLimiters {
				if capLimiter == nil {
					continue
				}
				if err = capLimiter.Wait(ctx); err != nil {
					return err
				}
			}
		}
		attemptCtx := context.WithValue(ctx, restAttemptContextKey{}, attempt)
		err = job.run(attemptCtx)
		if err == nil {
			if limiter != nil {
				limiter.Success()
			}
			return nil
		}
		throttled := isThrottleErr(err)
		if limiter != nil && throttled {
			limiter.Throttle()
		}
		if !throttled && !isRetryableErr(err) {
			return err
		}
		if attempt == restMaxAttempts {
			return err
		}
		if !throttled {
			if sleepErr := sleepWithContext(ctx, restBackoff(attempt)); sleepErr != nil {
				return sleepErr
			}
		}
	}
	return err
}

func restBackoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	backoff := restBaseBackoff << (attempt - 1)
	if backoff > restMaxBackoff {
		backoff = restMaxBackoff
	}
	jitter := time.Duration(time.Now().UnixNano()%250) * time.Millisecond
	return backoff + jitter
}

func sleepWithContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
