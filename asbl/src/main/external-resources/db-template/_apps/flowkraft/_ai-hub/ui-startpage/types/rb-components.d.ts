declare namespace JSX {
  interface IntrinsicElements {
    "rb-tabulator": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        "report-id"?: string
        "component-id"?: string
        "api-base-url"?: string
        "api-key"?: string
      },
      HTMLElement
    >
    "rb-chart": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        "report-id"?: string
        "component-id"?: string
        "api-base-url"?: string
        "api-key"?: string
      },
      HTMLElement
    >
    "rb-pivot-table": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        "report-id"?: string
        "component-id"?: string
        "api-base-url"?: string
        "api-key"?: string
      },
      HTMLElement
    >
    "rb-value": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        "report-id"?: string
        "component-id"?: string
        "api-base-url"?: string
        "api-key"?: string
        field?: string
        format?: string
      },
      HTMLElement
    >
    "rb-filter-pane": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        "report-id"?: string
        "component-id"?: string
        "api-base-url"?: string
        "api-key"?: string
        "connection-id"?: string
        "table-name"?: string
        field?: string
      },
      HTMLElement
    >
    "rb-cube-renderer": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        "connection-id"?: string
        "api-base-url"?: string
        "api-key"?: string
      },
      HTMLElement
    >
    "rb-parameters": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        "report-id"?: string
        "api-base-url"?: string
        "api-key"?: string
      },
      HTMLElement
    >
    "rb-report": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        "report-id"?: string
        "api-base-url"?: string
        "api-key"?: string
      },
      HTMLElement
    >
    /** The same element as rb-report, under the name a published dashboard is read by. */
    "rb-dashboard": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        "report-id"?: string
        "api-base-url"?: string
        "api-key"?: string
      },
      HTMLElement
    >
  }
}

export {}
