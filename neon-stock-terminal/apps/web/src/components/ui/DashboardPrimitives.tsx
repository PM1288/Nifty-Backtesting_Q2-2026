import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { trackApiErrorShown, trackEmptyStateViewed, trackNavClick, trackWidgetExpanded } from "../../analytics/events";
import { useI18n } from "../../i18n/LocaleProvider";
import { trackAnalyticsError, trackAnalyticsEvent } from "../../lib/analytics";
import styles from "./DashboardPrimitives.module.css";

type Tone = "green" | "red" | "white";
type ButtonVariant = "primary" | "secondary" | "tertiary";
type ButtonSize = "s" | "m" | "l";
type DataStateKind = "loading" | "empty" | "error" | "delayed" | "partial";

type ButtonBaseProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  tone?: Tone;
  size?: ButtonSize;
  className?: string;
};

type StateProps = {
  title: string;
  body: string;
  action?: ReactNode;
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function translateNode(node: ReactNode, tr: (value: string) => string) {
  return typeof node === "string" ? tr(node) : node;
}

type SectionTabItem = {
  label: string;
  to: string;
  badge?: string;
  end?: boolean;
  external?: boolean;
  activeMatch?: (pathname: string) => boolean;
};

function isSectionTabActive(item: SectionTabItem, pathname: string) {
  if (item.activeMatch) return item.activeMatch(pathname);
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function ButtonLink({
  to,
  children,
  variant = "secondary",
  tone = "white",
  size = "m",
  className,
  onClick
}: ButtonBaseProps & { to: string; onClick?: () => void }) {
  const { tr } = useI18n();
  return (
    <Link
      to={to}
      className={classNames(styles.button, className)}
      data-variant={variant}
      data-tone={tone}
      data-size={size}
      onClick={onClick}
    >
      {translateNode(children, tr)}
    </Link>
  );
}

export function ExternalButtonLink({
  href,
  children,
  variant = "secondary",
  tone = "white",
  size = "m",
  className
}: ButtonBaseProps & { href: string }) {
  const { tr } = useI18n();
  return (
    <a
      href={href}
      className={classNames(styles.button, className)}
      data-variant={variant}
      data-tone={tone}
      data-size={size}
    >
      {translateNode(children, tr)}
    </a>
  );
}

export function ButtonButton({
  children,
  variant = "secondary",
  tone = "white",
  size = "m",
  className,
  disabled,
  onClick
}: ButtonBaseProps & { disabled?: boolean; onClick?: () => void }) {
  const { tr } = useI18n();
  return (
    <button
      type="button"
      className={classNames(styles.button, className)}
      data-variant={variant}
      data-tone={tone}
      data-size={size}
      data-disabled={disabled ? "true" : "false"}
      disabled={disabled}
      onClick={onClick}
    >
      {translateNode(children, tr)}
    </button>
  );
}

export function ButtonPrimary(props: ButtonBaseProps & { onClick?: () => void; disabled?: boolean }) {
  return <ButtonButton {...props} variant="primary" />;
}

export function ButtonSecondary(props: ButtonBaseProps & { onClick?: () => void; disabled?: boolean }) {
  return <ButtonButton {...props} variant="secondary" />;
}

export function ButtonTertiary(props: ButtonBaseProps & { onClick?: () => void; disabled?: boolean }) {
  return <ButtonButton {...props} variant="tertiary" />;
}

export function StatusBadge({ label, tone = "white" }: { label: string; tone?: Tone }) {
  const { tr } = useI18n();
  return (
    <span className={styles.badge} data-tone={tone}>
      {tr(label)}
    </span>
  );
}

export function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (nextValue: T) => void;
}) {
  const { tr } = useI18n();
  return (
    <div className={styles.toggleWrap}>
      <span className={styles.toggleLabel}>{tr(label)}</span>
      <div className={styles.toggleGroup} role="tablist" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.toggleSegment}
            role="tab"
            aria-selected={option.value === value}
            data-active={option.value === value ? "true" : "false"}
            onClick={() => onChange(option.value)}
          >
            {tr(option.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SectionTabs({
  label,
  items
}: {
  label: string;
  items: SectionTabItem[];
}) {
  const location = useLocation();
  const { tr } = useI18n();

  return (
    <nav className={styles.sectionTabs} aria-label={tr(label)}>
      {items.map((item) => {
        const active = isSectionTabActive(item, location.pathname);
        const body = (
          <>
            {item.badge ? <span className={styles.sectionTabBadge}>{tr(item.badge)}</span> : null}
            <span>{tr(item.label)}</span>
          </>
        );

        return item.external ? (
          <a
            key={`${item.label}-${item.to}`}
            href={item.to}
            className={styles.sectionTab}
            data-active={active ? "true" : "false"}
            onClick={() => {
              void trackNavClick({
                nav_type: "section_tabs",
                source_page: location.pathname,
                target_page: item.to,
                target_label: item.label
              });
              void trackAnalyticsEvent("local_tab_change", {
                source_page: location.pathname,
                target_page: item.to,
                target_label: item.label
              });
            }}
          >
            {body}
          </a>
        ) : (
          <Link
            key={`${item.label}-${item.to}`}
            to={item.to}
            className={styles.sectionTab}
            data-active={active ? "true" : "false"}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              void trackNavClick({
                nav_type: "section_tabs",
                source_page: location.pathname,
                target_page: item.to,
                target_label: item.label
              });
              void trackAnalyticsEvent("local_tab_change", {
                source_page: location.pathname,
                target_page: item.to,
                target_label: item.label
              });
            }}
          >
            {body}
          </Link>
        );
      })}
    </nav>
  );
}

export function PageIntroAccordion({
  label = "How to use this page",
  title,
  body,
  items,
  defaultOpen = false,
  widgetId,
  onOpen
}: {
  label?: string;
  title: string;
  body: string;
  items?: string[];
  defaultOpen?: boolean;
  widgetId?: string;
  onOpen?: () => void;
}) {
  const location = useLocation();
  const { tr } = useI18n();
  const resolvedWidgetId = useMemo(() => widgetId ?? slugify(`${label}_${title}`), [label, title, widgetId]);

  return (
    <details
      className={styles.introAccordion}
      open={defaultOpen}
      onToggle={(event) => {
        if (!event.currentTarget.open) return;
        void trackWidgetExpanded({
          widget_id: resolvedWidgetId,
          page_path: location.pathname
        });
        void trackAnalyticsEvent("accordion_expand", {
          widget_id: resolvedWidgetId,
          page_path: location.pathname
        });
        onOpen?.();
      }}
    >
      <summary className={styles.introSummary}>
        <span className={styles.introLabel}>{tr(label)}</span>
        <span className={styles.introTitle}>{tr(title)}</span>
      </summary>
      <div className={styles.introBody}>
        <p className={styles.introText}>{tr(body)}</p>
        {items?.length ? (
          <div className={styles.introList}>
            {items.map((item) => (
              <p key={item} className={styles.introListItem}>
                {tr(item)}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function DensityBadge({
  label,
  detail
}: {
  label: string;
  detail: string;
}) {
  const { tr } = useI18n();
  return (
    <div className={styles.densityBadge}>
      <strong className={styles.densityLabel}>{tr(label)}</strong>
      <span className={styles.densityDetail}>{tr(detail)}</span>
    </div>
  );
}

export function DataState({
  kind,
  title,
  body,
  action
}: StateProps & {
  kind: DataStateKind;
}) {
  const location = useLocation();
  const { t, tr, locale } = useI18n();
  const widgetId = useMemo(() => slugify(title), [title]);
  const eyebrow =
    kind === "loading"
      ? t("ui.loading", "Loading")
      : kind === "error"
        ? t("ui.somethingWentWrong", "Something went wrong")
        : kind === "delayed"
          ? t("ui.dataDelayed", "Data delayed")
        : kind === "partial"
            ? t("ui.partialData", "Partial data")
            : t("ui.noData", "No data");

  useEffect(() => {
    if (kind === "loading") return;
    if (kind === "error") {
      void trackApiErrorShown({
        widget_id: widgetId,
        page_path: location.pathname,
        error_code: widgetId
      });
      void trackAnalyticsError({
        type: "visible_error_state",
        severity: "warning",
        widget_id: widgetId,
        page_path: location.pathname,
        message: `${title} ${body}`.slice(0, 240)
      });
      return;
    }

    if (kind === "empty" || kind === "delayed" || kind === "partial") {
      void trackEmptyStateViewed({
        widget_id: widgetId,
        page_path: location.pathname,
        reason: kind
      });
    }
  }, [body, kind, location.pathname, title, widgetId]);

  return (
    <section className={styles.statePanel} data-kind={kind} role={kind === "error" ? "alert" : "status"}>
      <span className={styles.stateEyebrow}>{eyebrow}</span>
      <h1 className={styles.stateTitle}>{tr(title)}</h1>
      <p className={styles.stateBody}>{tr(body)}</p>
      {action}
    </section>
  );
}

export function LoadingState(props: StateProps) {
  return <DataState {...props} kind="loading" />;
}

export function EmptyState(props: StateProps) {
  return <DataState {...props} kind="empty" />;
}

export function ErrorState(props: StateProps) {
  return <DataState {...props} kind="error" />;
}

export function DelayedState(props: StateProps) {
  return <DataState {...props} kind="delayed" />;
}

export function PartialState(props: StateProps) {
  return <DataState {...props} kind="partial" />;
}

export function SectionDivider({
  eyebrow,
  title,
  subtitle,
  action
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { tr } = useI18n();
  return (
    <div className={styles.sectionDivider}>
      <div className={styles.sectionCopy}>
        {eyebrow ? <span className={styles.sectionEyebrow}>{tr(eyebrow)}</span> : null}
        <h2 className={styles.sectionTitle}>{tr(title)}</h2>
        {subtitle ? <p className={styles.sectionSubtitle}>{translateNode(subtitle, tr)}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  meta,
  tone = "white"
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  tone?: Tone;
}) {
  const { tr } = useI18n();
  return (
    <article className={styles.kpiCard}>
      <div className={styles.kpiLabel}>{tr(label)}</div>
      <div className={styles.kpiValue} data-tone={tone}>
        {value}
      </div>
      {meta ? <div className={styles.kpiMeta}>{translateNode(meta, tr)}</div> : null}
    </article>
  );
}

export function SymbolPill({
  label,
  detail,
  tone = "white"
}: {
  label: string;
  detail?: ReactNode;
  tone?: Tone;
}) {
  const { tr } = useI18n();
  return (
    <span className={styles.symbolPill} data-tone={tone}>
      <strong className={styles.symbolPillLabel}>{tr(label)}</strong>
      {detail ? <span className={styles.symbolPillDetail}>{translateNode(detail, tr)}</span> : null}
    </span>
  );
}

export function InterpretationCard({
  title,
  items
}: {
  title: string;
  items: string[];
}) {
  const { tr } = useI18n();
  return (
    <article className={styles.card}>
      <h3 className={styles.cardTitle}>{tr(title)}</h3>
      <div className={styles.cardList}>
        {items.map((item) => (
          <p key={item} className={styles.cardItem}>
            {tr(item)}
          </p>
        ))}
      </div>
    </article>
  );
}

export function PlainLanguageCard({
  title,
  body,
  secondaryTitle,
  secondaryBody
}: {
  title: string;
  body: string;
  secondaryTitle?: string;
  secondaryBody?: string;
}) {
  const { t, tr, locale } = useI18n();
  return (
    <article className={styles.card}>
      <span className={styles.sectionEyebrow}>{t("ui.plainLanguageRead", "Plain-language read")}</span>
      <h3 className={styles.cardTitle}>{tr(title)}</h3>
      <p className={styles.cardText}>{tr(body)}</p>
      {secondaryTitle && secondaryBody ? (
        <div className={styles.cardList}>
          <p className={styles.cardItem}>
            <strong>{tr(secondaryTitle)}</strong>
          </p>
          <p className={styles.cardItem}>{tr(secondaryBody)}</p>
        </div>
      ) : null}
    </article>
  );
}

export function ChartCard({
  title,
  subtitle,
  meta,
  action,
  footer,
  children
}: {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { tr } = useI18n();
  return (
    <article className={styles.chartCard} data-clarity-unmask="true">
      <div className={styles.chartHeader}>
        <div className={styles.chartCopy}>
          <h3 className={styles.chartTitle}>{tr(title)}</h3>
          {subtitle ? <p className={styles.chartSubtitle}>{translateNode(subtitle, tr)}</p> : null}
        </div>
        {meta || action ? (
          <div className={styles.chartMeta}>
            {translateNode(meta, tr)}
            {action}
          </div>
        ) : null}
      </div>
      <div className={styles.chartBody}>{children}</div>
      {footer ? <div className={styles.chartFooter}>{translateNode(footer, tr)}</div> : null}
    </article>
  );
}

export function LoadingSkeletonCard({
  title,
  lines = 3,
  compact = false
}: {
  title?: string;
  lines?: number;
  compact?: boolean;
}) {
  const { t, tr } = useI18n();
  const resolvedTitle = title ?? t("ui.loading", "Loading");
  return (
    <article className={styles.chartCard} data-skeleton="true">
      <div className={styles.chartHeader}>
        <div className={styles.chartCopy}>
          <h3 className={styles.chartTitle}>{tr(resolvedTitle)}</h3>
        </div>
      </div>
      <div className={styles.skeletonStack} data-compact={compact ? "true" : "false"}>
        {Array.from({ length: lines }).map((_, index) => (
          <span
            key={`${resolvedTitle}-${index}`}
            className={styles.skeletonLine}
            style={{ width: `${Math.max(38, 96 - index * 11)}%` }}
          />
        ))}
      </div>
    </article>
  );
}

export function LoadingTableCard({
  title,
  rows = 6
}: {
  title?: string;
  rows?: number;
}) {
  const { t, tr } = useI18n();
  const resolvedTitle = title ?? t("ui.loadingTable", "Loading table");
  return (
    <article className={styles.tableCard} data-skeleton="true">
      <div className={styles.chartHeader}>
        <div className={styles.chartCopy}>
          <h3 className={styles.chartTitle}>{tr(resolvedTitle)}</h3>
        </div>
      </div>
      <div className={styles.skeletonTable}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={`${resolvedTitle}-${index}`} className={styles.skeletonTableRow}>
            <span className={styles.skeletonLine} style={{ width: index % 2 === 0 ? "26%" : "22%" }} />
            <span className={styles.skeletonLine} style={{ width: "48%" }} />
            <span className={styles.skeletonLine} style={{ width: "14%" }} />
          </div>
        ))}
      </div>
    </article>
  );
}

type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  sortValue?: (row: T) => string | number | boolean | null | undefined;
};

export function DataTable<T>({
  title,
  subtitle,
  columns,
  rows,
  emptyTitle,
  emptyBody,
  footer,
  maxHeight,
  tableName,
  filterValue,
  filterPlaceholder,
  onFilterValueChange,
  onSortChange
}: {
  title: string;
  subtitle?: ReactNode;
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  emptyTitle?: string;
  emptyBody?: string;
  footer?: ReactNode;
  maxHeight?: number;
  tableName?: string;
  filterValue?: string;
  filterPlaceholder?: string;
  onFilterValueChange?: (value: string) => void;
  onSortChange?: (columnKey: string, direction: "asc" | "desc") => void;
}) {
  const [sortState, setSortState] = useState<{ columnKey: string; direction: "asc" | "desc" } | null>(null);
  const { t, tr, locale } = useI18n();
  const resolvedEmptyTitle = emptyTitle ?? t("ui.noRowsAvailable", "No rows available");
  const resolvedEmptyBody = emptyBody ?? t("ui.tableNoData", "Nothing matches this view right now.");
  const resolvedFilterPlaceholder = filterPlaceholder ?? t("ui.filterRows", "Filter rows");

  const filteredRows = useMemo(() => {
    const query = filterValue?.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      columns.some((column) => {
        const value = column.sortValue?.(row);
        if (value == null) return false;
        return String(value).toLowerCase().includes(query);
      })
    );
  }, [columns, filterValue, rows]);

  const displayedRows = useMemo(() => {
    if (!sortState) return filteredRows;
    const column = columns.find((item) => item.key === sortState.columnKey);
    if (!column?.sortValue) return filteredRows;
    return [...filteredRows].sort((left, right) => {
      const leftValue = column.sortValue?.(left);
      const rightValue = column.sortValue?.(right);
      if (leftValue == null && rightValue == null) return 0;
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;
      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return sortState.direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
      }
      const leftText = String(leftValue);
      const rightText = String(rightValue);
      return sortState.direction === "asc"
        ? leftText.localeCompare(rightText, locale)
        : rightText.localeCompare(leftText, locale);
    });
  }, [columns, filteredRows, locale, sortState]);

  const handleSort = (columnKey: string) => {
    setSortState((current) => {
      const direction =
        current?.columnKey === columnKey && current.direction === "asc" ? "desc" : "asc";
      onSortChange?.(columnKey, direction);
      void trackAnalyticsEvent("table_sort_change", {
        table_name: tableName ?? title,
        sort_column: columnKey,
        sort_direction: direction
      });
      return { columnKey, direction };
    });
  };

  return (
    <article className={styles.tableCard} data-clarity-unmask="true" data-clarity-region="details_table" data-table-name={tableName}>
      <div className={styles.chartHeader}>
        <div className={styles.chartCopy}>
          <h3 className={styles.chartTitle}>{tr(title)}</h3>
          {subtitle ? <p className={styles.chartSubtitle}>{translateNode(subtitle, tr)}</p> : null}
        </div>
        {onFilterValueChange ? (
          <div className={styles.tableToolbar}>
            <input
              type="search"
              value={filterValue ?? ""}
              onChange={(event) => {
                onFilterValueChange(event.currentTarget.value);
                void trackAnalyticsEvent("table_filter_change", {
                  table_name: tableName ?? title,
                  filter_value: event.currentTarget.value.slice(0, 64)
                });
              }}
              placeholder={tr(resolvedFilterPlaceholder)}
              className={styles.tableFilterInput}
              aria-label={`${tr(title)} ${t("ui.filterRows", "Filter rows")}`}
            />
          </div>
        ) : null}
      </div>
      {displayedRows.length ? (
        <div className={styles.tableFrame} style={maxHeight ? { maxHeight } : undefined}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} data-align={column.align ?? "left"}>
                    {column.sortable ? (
                      <button
                        type="button"
                        className={styles.tableSortButton}
                        onClick={() => handleSort(column.key)}
                      >
                        <span>{translateNode(column.header, tr)}</span>
                        <span className={styles.tableSortGlyph}>
                          {sortState?.columnKey === column.key ? (sortState.direction === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    ) : (
                      translateNode(column.header, tr)
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column.key} data-align={column.align ?? "left"}>
                      {translateNode(column.cell(row), tr)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.tableEmpty}>
          <strong>{filterValue ? t("ui.noFilteredRows", "No filtered rows") : tr(resolvedEmptyTitle)}</strong>
          <span>{filterValue ? t("ui.broaderFilter", "Try a broader filter or clear the current query.") : tr(resolvedEmptyBody)}</span>
        </div>
      )}
      {footer ? <div className={styles.chartFooter}>{translateNode(footer, tr)}</div> : null}
    </article>
  );
}
