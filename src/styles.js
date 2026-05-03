export const styles = {
  app: {
    minHeight: "100vh",
    background: "transparent",
    color: "#0f172a",
    fontFamily:
      'Inter, "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    paddingBottom: "128px",
    maxWidth: "760px",
    margin: "0 auto",
  },

  loading: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    fontSize: "18px",
    color: "#0f172a",
  },

  authWrap: {
    minHeight: "100vh",
    padding: "20px",
    display: "flex",
    alignItems: "center",
  },

  heroCard: {
    width: "100%",
    background: "rgba(255,255,255,0.84)",
    backdropFilter: "blur(16px)",
    borderRadius: "32px",
    padding: "24px",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.10)",
    border: "1px solid rgba(255,255,255,0.65)",
  },

  authBadgeRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
    flexWrap: "wrap",
  },

  authBadge: {
    background: "#dbeafe",
    color: "#1d4ed8",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: "700",
  },

  authMuted: {
    color: "#64748b",
    fontSize: "14px",
  },

  heroTitle: {
    fontSize: "40px",
    lineHeight: 1,
    margin: "0 0 12px",
    letterSpacing: 0,
  },

  kicker: {
    color: "#2563eb",
    fontWeight: "800",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    margin: "0 0 6px",
  },

  subText: {
    color: "#475569",
    marginBottom: "20px",
    fontSize: "15px",
    lineHeight: 1.6,
  },

  topBar: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    padding: "16px 16px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    background:
      "linear-gradient(180deg, rgba(248,251,255,0.94), rgba(248,251,255,0.76), rgba(248,251,255,0))",
    backdropFilter: "blur(10px)",
  },

  topBarText: {
    minWidth: 0,
  },

  topTitle: {
    margin: 0,
    fontSize: "30px",
    lineHeight: 1,
    letterSpacing: 0,
  },

  topEmail: {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: "13px",
  },

  logoutBtn: {
    border: "1px solid rgba(248, 113, 113, 0.24)",
    background: "rgba(254, 226, 226, 0.82)",
    color: "#b91c1c",
    padding: "10px 14px",
    borderRadius: "999px",
    fontWeight: "700",
    flexShrink: 0,
  },

  main: {
    padding: "0 16px",
  },

  balanceCard: {
    background:
      "linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #14b8a6 100%)",
    color: "white",
    borderRadius: "30px",
    padding: "22px",
    boxShadow: "0 24px 48px rgba(29, 78, 216, 0.24)",
    marginBottom: "14px",
    overflow: "hidden",
  },

  balanceTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "8px",
    flexWrap: "wrap",
  },

  pulseTag: {
    background: "rgba(255,255,255,0.16)",
    border: "1px solid rgba(255,255,255,0.22)",
    padding: "7px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },

  smallWhite: {
    opacity: 0.92,
    margin: 0,
    fontSize: "14px",
  },

  bigMoney: {
    fontSize: "46px",
    margin: "0 0 8px",
    lineHeight: 0.98,
    letterSpacing: 0,
  },

  balanceSubcopy: {
    margin: 0,
    opacity: 0.88,
    lineHeight: 1.5,
    maxWidth: "34ch",
    fontSize: "14px",
  },

  balancePills: {
    display: "flex",
    gap: "10px",
    marginTop: "18px",
    flexWrap: "wrap",
  },

  statPill: {
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: "18px",
    padding: "10px 12px",
    minWidth: "92px",
  },

  statPillLabel: {
    display: "block",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.75,
    marginBottom: "4px",
  },

  statPillValue: {
    fontSize: "14px",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    marginBottom: "14px",
  },

  miniCard: {
    background: "rgba(255,255,255,0.86)",
    backdropFilter: "blur(14px)",
    borderRadius: "22px",
    padding: "16px",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
    border: "1px solid rgba(255,255,255,0.6)",
  },

  cardLabel: {
    margin: 0,
    color: "#64748b",
    fontSize: "13px",
  },

  cardValue: {
    margin: "8px 0 0",
    fontSize: "22px",
    letterSpacing: 0,
  },

  section: {
    background: "rgba(255,255,255,0.86)",
    backdropFilter: "blur(14px)",
    borderRadius: "24px",
    padding: "18px",
    marginBottom: "14px",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
    border: "1px solid rgba(255,255,255,0.6)",
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
    flexWrap: "wrap",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "18px",
    letterSpacing: 0,
  },

  sectionActions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  sectionIntro: {
    color: "#475569",
    lineHeight: 1.6,
  },

  smallMuted: {
    color: "#64748b",
    fontSize: "13px",
    lineHeight: 1.6,
  },

  emptyText: {
    color: "#64748b",
    lineHeight: 1.6,
  },

  notice: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    borderRadius: "14px",
    padding: "12px 14px",
    margin: "0 0 12px",
    border: "1px solid #dbe4f0",
    background: "#f8fbff",
    color: "#0f172a",
  },

  noticeTone: {
    info: {
      background: "#f8fbff",
      borderColor: "#bfdbfe",
    },
    good: {
      background: "#f0fdf4",
      borderColor: "#bbf7d0",
    },
    warn: {
      background: "#fffbeb",
      borderColor: "#fde68a",
    },
    bad: {
      background: "#fef2f2",
      borderColor: "#fecaca",
    },
  },

  noticeTitle: {
    display: "block",
    fontSize: "14px",
    marginBottom: "2px",
  },

  noticeBody: {
    margin: 0,
    color: "#475569",
    fontSize: "13px",
    lineHeight: 1.5,
  },

  noticeCloseBtn: {
    border: 0,
    background: "transparent",
    color: "#475569",
    fontWeight: 800,
    cursor: "pointer",
    padding: "2px 0",
  },

  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 0",
    borderBottom: "1px solid #e8eef7",
  },

  transactionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "14px 0",
    borderBottom: "1px solid #e8eef7",
  },

  transactionCopy: {
    minWidth: 0,
  },

  transactionMeta: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: "13px",
    lineHeight: 1.5,
  },

  accountCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "14px",
    background: "#f8fbff",
    borderRadius: "18px",
    marginBottom: "10px",
    border: "1px solid #e8eef7",
  },

  input: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "16px",
    border: "1px solid #dbe4f0",
    marginBottom: "10px",
    fontSize: "16px",
    background: "rgba(255,255,255,0.94)",
    color: "#0f172a",
    outline: "none",
  },

  textarea: {
    width: "100%",
    minHeight: "120px",
    resize: "vertical",
    padding: "14px 16px",
    borderRadius: "16px",
    border: "1px solid #dbe4f0",
    marginBottom: "10px",
    fontSize: "16px",
    background: "rgba(255,255,255,0.94)",
    color: "#0f172a",
    fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
  },

  label: {
    display: "block",
    fontWeight: "700",
    marginBottom: "8px",
  },

  primaryBtn: {
    width: "100%",
    border: "none",
    background: "linear-gradient(135deg, #2563eb 0%, #14b8a6 100%)",
    color: "white",
    padding: "15px",
    borderRadius: "16px",
    fontWeight: "800",
    fontSize: "16px",
    boxShadow: "0 18px 30px rgba(37, 99, 235, 0.20)",
  },

  secondaryBtn: {
    width: "100%",
    border: "1px solid #dbeafe",
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "14px",
    borderRadius: "16px",
    fontWeight: "700",
    fontSize: "16px",
    marginTop: "10px",
  },

  ghostBtn: {
    border: "1px solid #dbe4f0",
    background: "white",
    color: "#475569",
    padding: "8px 12px",
    borderRadius: "999px",
    fontWeight: "700",
    fontSize: "13px",
  },

  progressOuter: {
    height: "14px",
    background: "#e2e8f0",
    borderRadius: "999px",
    overflow: "hidden",
    marginTop: "10px",
  },

  progressInner: {
    height: "100%",
    background: "linear-gradient(90deg, #22c55e, #14b8a6)",
    borderRadius: "999px",
  },

  goalStat: {
    fontSize: "24px",
    fontWeight: "800",
    letterSpacing: 0,
  },

  nav: {
    position: "fixed",
    bottom: "12px",
    left: "12px",
    right: "12px",
    maxWidth: "736px",
    margin: "0 auto",
    background: "rgba(255,255,255,0.88)",
    backdropFilter: "blur(18px)",
    borderRadius: "26px",
    padding: "10px",
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "8px",
    boxShadow: "0 24px 40px rgba(15, 23, 42, 0.12)",
    border: "1px solid rgba(255,255,255,0.75)",
  },

  navBtn: {
    border: "none",
    fontWeight: "700",
    color: "#64748b",
    background: "transparent",
    padding: "11px 6px",
    borderRadius: "16px",
    fontSize: "12px",
  },

  navBtnActive: {
    color: "#0f172a",
    background: "#e0f2fe",
  },

  receiptPreview: {
    background: "#f8fbff",
    border: "1px solid #dbe4f0",
    padding: "12px",
    borderRadius: "16px",
    marginBottom: "10px",
  },

  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
    fontSize: "14px",
    color: "#334155",
  },

  matchBox: {
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    color: "#166534",
    padding: "12px",
    borderRadius: "16px",
    marginBottom: "12px",
  },

  coachSection: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  coachShell: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    flex: 1,
    minHeight: 0,
    height: "100%",
  },

  coachStatusCard: {
    background: "#f8fbff",
    border: "1px solid #dbe4f0",
    borderRadius: "18px",
    padding: "14px",
  },

  coachStatusTitle: {
    margin: "0 0 6px",
    fontSize: "16px",
    letterSpacing: 0,
  },

  quickPromptRow: {
    display: "flex",
    gap: "8px",
  },

  promptChip: {
    border: "1px solid #dbe4f0",
    background: "#f8fbff",
    color: "#1e293b",
    borderRadius: "999px",
    padding: "10px 12px",
    whiteSpace: "nowrap",
    fontSize: "13px",
    fontWeight: "700",
  },

  actionChipWrap: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "12px",
  },

  actionChip: {
    border: "1px solid #dbe4f0",
    background: "#f8fbff",
    color: "#0f172a",
    borderRadius: "999px",
    padding: "11px 13px",
    fontSize: "13px",
    fontWeight: "700",
  },

  chatMessages: {
    overflowY: "auto",
    padding: "12px",
    background: "#f8fbff",
    borderRadius: "18px",
    border: "1px solid #e2e8f0",
    flex: 1,
  },

  historyNote: {
    fontSize: "12px",
    color: "#64748b",
    background: "#eef6ff",
    borderRadius: "12px",
    padding: "10px 12px",
    marginBottom: "10px",
  },

  errorNote: {
    fontSize: "13px",
    color: "#991b1b",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "12px",
    padding: "10px 12px",
    marginBottom: "10px",
  },

  emptyCoachState: {
    padding: "12px 4px",
  },

  emptyCoachTitle: {
    fontWeight: "800",
    marginBottom: "6px",
  },

  chatInputBar: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    paddingTop: "10px",
    position: "sticky",
    bottom: 0,
    background: "linear-gradient(180deg, rgba(248,251,255,0), rgba(248,251,255,0.98) 28%)",
    zIndex: 2,
  },

  chatInput: {
    flex: 1,
    padding: "14px 16px",
    borderRadius: "16px",
    border: "1px solid #dbe2ea",
    fontSize: "16px",
    background: "white",
    minWidth: 0,
  },

  chatSendBtn: {
    padding: "14px 18px",
    borderRadius: "16px",
    border: "none",
    background: "linear-gradient(135deg, #2563eb 0%, #14b8a6 100%)",
    color: "white",
    fontWeight: 800,
    minWidth: "78px",
  },

  chatMetaRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "6px",
    fontSize: "11px",
  },

  chatRoleLabel: {
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.78,
  },

  chatTimeLabel: {
    opacity: 0.68,
  },

  userBubbleModern: {
    marginLeft: "auto",
    maxWidth: "82%",
    background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    color: "white",
    padding: "12px 14px",
    borderRadius: "18px 18px 6px 18px",
    marginBottom: "10px",
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
    boxShadow: "0 10px 20px rgba(37, 99, 235, 0.16)",
  },

  aiBubbleModern: {
    marginRight: "auto",
    maxWidth: "82%",
    background: "white",
    color: "#111827",
    padding: "12px 14px",
    borderRadius: "18px 18px 18px 6px",
    marginBottom: "10px",
    whiteSpace: "pre-wrap",
    border: "1px solid #e5e7eb",
    lineHeight: 1.5,
  },

  aiInsightGrid: {
    display: "grid",
    gap: "10px",
  },

  compactInsightGrid: {
    display: "grid",
    gap: "8px",
  },

  insightCard: {
    background: "#f8fbff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "12px",
  },

  insightLabel: {
    margin: "0 0 6px",
    fontSize: "12px",
    fontWeight: "800",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  insightHeadline: {
    margin: "0 0 6px",
    fontSize: "15px",
    letterSpacing: 0,
  },

  insightBody: {
    margin: 0,
    color: "#475569",
    lineHeight: 1.45,
    fontSize: "13px",
  },
  insightCardInteractive: {
    border: "1px solid #cfe0ff",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },

  actionCard: {
    background: "#f8fbff",
    border: "1px solid #cfe0ff",
    borderRadius: "18px",
    padding: "12px",
    textAlign: "left",
    width: "100%",
    cursor: "pointer",
  },

  insightCta: {
    display: "inline-block",
    marginTop: "10px",
    color: "#2563eb",
    fontWeight: "800",
    fontSize: "13px",
  },

  signalCard: {
    padding: "14px",
    borderRadius: "18px",
    border: "1px solid #e2e8f0",
    background: "#f8fbff",
    marginBottom: "10px",
  },

  signalHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
  },

  signalBody: {
    marginTop: "10px",
    color: "#475569",
    lineHeight: 1.6,
    fontSize: "14px",
  },

  inlineBtnRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "12px",
  },

  primaryInlineBtn: {
    border: "none",
    background: "#2563eb",
    color: "white",
    padding: "10px 12px",
    borderRadius: "12px",
    fontWeight: "700",
    fontSize: "13px",
  },

  secondaryInlineBtn: {
    border: "1px solid #dbe4f0",
    background: "white",
    color: "#334155",
    padding: "10px 12px",
    borderRadius: "12px",
    fontWeight: "700",
    fontSize: "13px",
  },

  statusPillRow: {
    marginTop: "10px",
  },

  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "800",
  },

  calendarTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "16px",
  },

  calendarToolbar: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },

  calendarSummaryAction: {
    border: "1px solid #cfe0ff",
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    color: "#0f172a",
    borderRadius: "18px",
    padding: "16px",
    display: "grid",
    gap: "7px",
    textAlign: "left",
    cursor: "pointer",
    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.05)",
    minHeight: "104px",
    fontWeight: "700",
  },

  calendarCorrectionPanel: {
    border: "1px solid rgba(148,163,184,.22)",
    borderRadius: "20px",
    padding: "14px",
    margin: "12px 0 16px",
    background: "rgba(248,250,252,.92)",
    display: "grid",
    gap: "10px",
  },

  calendarCorrectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },

  calendarCorrectionRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
    flexWrap: "wrap",
    border: "1px solid rgba(148,163,184,.2)",
    borderRadius: "16px",
    padding: "12px",
    background: "white",
  },

  calendarCorrectionButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "flex-end",
  },

  modeChipRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },

  modeChipActive: {
    background: "linear-gradient(135deg, #dbeafe 0%, #ccfbf1 100%)",
    borderColor: "#93c5fd",
    color: "#0f172a",
  },

  calendarTitleWrap: {
    textAlign: "center",
    flex: 1,
  },

  calendarTitle: {
    margin: 0,
    fontSize: "20px",
  },

  calendarGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(84px, 1fr))",
    gap: "8px",
    width: "100%",
  },

  calendarDayHeader: {
    textAlign: "center",
    fontSize: "12px",
    fontWeight: "800",
    color: "#64748b",
    paddingBottom: "4px",
  },

  calendarCell: {
    minHeight: "120px",
    minWidth: 0,
    background: "#f8fbff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    textAlign: "left",
    overflow: "hidden",
  },

  calendarCellShort: {
    minHeight: "108px",
  },

  calendarCellSelected: {
    border: "1px solid #60a5fa",
    boxShadow: "0 0 0 3px rgba(96, 165, 250, 0.14)",
  },

  calendarCellMuted: {
    opacity: 0.45,
  },

  calendarCellFuture: {
    background: "#f8fafc",
    opacity: 0.46,
    cursor: "not-allowed",
    boxShadow: "none",
  },

  calendarNavBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },

  timeframeChipDisabled: {
    opacity: 0.35,
    cursor: "not-allowed",
  },

  calendarRangeHint: {
    color: "#64748b",
    fontSize: "12px",
    lineHeight: 1.5,
    marginTop: "-4px",
    marginBottom: "14px",
  },

  calendarDateRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
  },

  calendarDate: {
    fontSize: "13px",
    fontWeight: "800",
    color: "#0f172a",
  },

  calendarWeekdayMini: {
    fontSize: "10px",
    color: "#94a3b8",
    fontWeight: "700",
    marginTop: "2px",
  },

  calendarCountTag: {
    fontSize: "10px",
    fontWeight: "800",
    color: "#2563eb",
    background: "#e0f2fe",
    borderRadius: "999px",
    padding: "4px 6px",
  },

  calendarNetPillPositive: {
    alignSelf: "flex-start",
    background: "#dcfce7",
    color: "#166534",
    borderRadius: "999px",
    padding: "6px 8px",
    fontSize: "11px",
    fontWeight: "800",
  },

  calendarNetPillNegative: {
    alignSelf: "flex-start",
    background: "#fee2e2",
    color: "#991b1b",
    borderRadius: "999px",
    padding: "6px 8px",
    fontSize: "11px",
    fontWeight: "800",
  },

  calendarEmptyHint: {
    color: "#94a3b8",
    fontSize: "11px",
    fontWeight: "700",
  },

  calendarFutureBlock: {
    flex: 1,
  },

  calendarSingleLabel: {
    background: "white",
    border: "1px solid #e2e8f0",
    color: "#334155",
    borderRadius: "10px",
    padding: "6px 8px",
    fontSize: "11px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  calendarRecurringStack: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },

  calendarInlinePanel: {
    marginTop: "12px",
    background: "#ffffff",
    border: "1px solid #dbe4f0",
    borderRadius: "18px",
    padding: "14px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },

  calendarInlinePanelTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "10px",
  },


  calendarEvent: {
    border: "none",
    textAlign: "left",
    borderRadius: "12px",
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    fontSize: "11px",
  },

  calendarEventIncome: {
    background: "#dbeafe",
    color: "#1d4ed8",
  },

  calendarEventBill: {
    background: "#fee2e2",
    color: "#991b1b",
  },

  calendarEventSubscription: {
    background: "#ede9fe",
    color: "#5b21b6",
  },

  calendarEventText: {
    fontWeight: "800",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  calendarEventAmount: {
    opacity: 0.9,
  },

  calendarMore: {
    fontSize: "11px",
    color: "#64748b",
  },

  monthTrendRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "12px 0",
    borderBottom: "1px solid #e8eef7",
  },

  daySummaryCard: {
    background: "#f8fbff",
    border: "1px solid #dbe4f0",
    borderRadius: "16px",
    padding: "14px",
    marginBottom: "10px",
  },

  inlineInfoBlock: {
    marginTop: "12px",
  },
};
