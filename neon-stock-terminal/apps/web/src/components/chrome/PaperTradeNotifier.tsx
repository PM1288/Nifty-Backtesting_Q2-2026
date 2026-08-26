import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, CheckCircle2, Crosshair, X } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchPaperTradeNotifications } from "../../lib/api";
import { paperTradeSpeechText, unseenNotificationIds, validPaperTradeNotifications } from "./paperTradeNotifications";
import styles from "./PaperTradeNotifier.module.css";

const AUTO_CLOSE_MS = 9_000;

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function PaperTradeNotifier({ enabled, audible }: { enabled: boolean; audible: boolean }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const initializedRef = useRef(false);
  const knownIdsRef = useRef(new Set<string>());
  const audioContextRef = useRef<AudioContext | null>(null);
  const autoOpenedRef = useRef(false);

  const query = useQuery({
    queryKey: ["paper-trade-notifications"],
    queryFn: fetchPaperTradeNotifications,
    enabled,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 2_000,
    retry: 2,
  });
  const items = useMemo(() => validPaperTradeNotifications(query.data), [query.data]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const unlockAudio = () => {
      if (!audioContextRef.current) {
        const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) audioContextRef.current = new AudioContextCtor();
      }
      void audioContextRef.current?.resume();
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [enabled]);

  const playPop = useCallback(() => {
    if (!audible) return;
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    gain.connect(context.destination);
    [740, 988].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.055);
      oscillator.connect(gain);
      oscillator.start(now + index * 0.055);
      oscillator.stop(now + 0.2 + index * 0.055);
    });
  }, [audible]);

  const speakEvents = useCallback((eventIds: string[]) => {
    if (!audible || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const selected = items.filter((item) => eventIds.includes(item.id)).reverse();
    for (const item of selected) {
      const utterance = new SpeechSynthesisUtterance(paperTradeSpeechText(item));
      utterance.lang = "en-IN";
      utterance.rate = 0.96;
      utterance.pitch = 1;
      utterance.volume = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  }, [audible, items]);

  useEffect(() => {
    if (!query.data) return;
    if (!initializedRef.current) {
      knownIdsRef.current = new Set(items.map((item) => item.id));
      initializedRef.current = true;
      return;
    }
    const newIds = unseenNotificationIds(knownIdsRef.current, items);
    knownIdsRef.current = new Set(items.map((item) => item.id));
    if (!newIds.length) return;
    setUnread((value) => Math.min(5, value + newIds.length));
    setOpen(true);
    autoOpenedRef.current = true;
    playPop();
    speakEvents(newIds);
  }, [items, playPop, query.data, speakEvents]);

  const latestItemId = items[0]?.id;
  useEffect(() => {
    if (!audible && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [audible]);

  useEffect(() => {
    if (!open || !autoOpenedRef.current) return;
    const timer = window.setTimeout(() => {
      if (autoOpenedRef.current) {
        setOpen(false);
        autoOpenedRef.current = false;
      }
    }, AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [latestItemId, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        autoOpenedRef.current = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const toggleOpen = () => {
    setOpen((value) => !value);
    setUnread(0);
    autoOpenedRef.current = false;
  };

  if (!enabled) return null;

  return (
    <aside className={styles.root} data-open={open ? "true" : "false"} aria-label="Paper trade notifications">
      <div className={styles.liveAnnouncement} aria-live="polite" aria-atomic="true">
        {unread > 0 && items[0] ? `${items[0].title} at ${formatTimestamp(items[0].occurredAt)}` : ""}
      </div>
      {open ? (
        <section className={styles.panel} role="region" aria-label="Latest five paper trade notifications" onPointerEnter={() => { autoOpenedRef.current = false; setUnread(0); }}>
          <header className={styles.panelHeader}>
            <div><span>PAPER EVENTS</span><strong>Latest notifications</strong></div>
            <div className={styles.headerActions}>
              <button type="button" onClick={() => { setOpen(false); autoOpenedRef.current = false; }} aria-label="Close paper trade notifications"><X size={17} /></button>
            </div>
          </header>
          <div className={styles.list}>
            {query.isLoading ? <p className={styles.state}>Loading paper events…</p> : null}
            {query.isError ? <p className={styles.error}>Paper event feed is temporarily unavailable. Retrying automatically.</p> : null}
            {!query.isLoading && !query.isError && items.length === 0 ? <p className={styles.state}>No paper entries or target hits yet.</p> : null}
            {items.map((item) => (
              <Link key={item.id} to={item.deepLink} className={styles.item} onClick={() => { setOpen(false); setUnread(0); }}>
                <span className={styles.eventIcon} data-kind={item.kind} aria-hidden="true">
                  {item.kind === "ENTRY" ? <CheckCircle2 size={17} /> : <Crosshair size={17} />}
                </span>
                <span className={styles.itemText}>
                  <span className={styles.itemMeta}><strong>{item.symbol}</strong><time dateTime={item.occurredAt}>{formatTimestamp(item.occurredAt)} IST</time></span>
                  <b>{item.kind === "ENTRY" ? "Paper trade entered" : "Target hit"}</b>
                  <small>{item.body || item.title}</small>
                </span>
              </Link>
            ))}
          </div>
          <footer><Link to="/paper-trading?source=paper-alerts" onClick={() => setOpen(false)}>Open Paper Trading evidence</Link><span>{query.data?.asOf ? `Checked ${formatTimestamp(query.data.asOf)} IST` : "Durable event feed"}</span></footer>
        </section>
      ) : null}
      <button type="button" className={styles.launcher} onClick={toggleOpen} aria-expanded={open} aria-label={`Paper trade notifications${unread ? `, ${unread} new` : ""}`}>
        <BellRing size={18} aria-hidden="true" />
        <span>Paper alerts</span>
        {unread ? <em aria-hidden="true">{unread}</em> : null}
      </button>
    </aside>
  );
}
