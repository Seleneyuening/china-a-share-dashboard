import type { EconomicEvent } from "../types";

export const mockEvents: EconomicEvent[] = [
  { date: "07-14", label: "美国 CPI 08:30 ET", type: "CPI", color: "#4aa3ff" },
  { date: "07-29", label: "FOMC 决议 14:00 ET", type: "FOMC", color: "#9b5cff" },
  { date: "07-31", label: "日本央行会议", type: "BOJ", color: "#ffd24a" },
  { date: "08-07", label: "美国非农 08:30 ET", type: "NFP", color: "#ff5252" },
  { date: "08-12", label: "美国 CPI 08:30 ET", type: "CPI", color: "#4aa3ff" },
  { date: "09-04", label: "美国非农 08:30 ET", type: "NFP", color: "#ff5252" },
  { date: "09-16", label: "FOMC 决议 14:00 ET", type: "FOMC", color: "#9b5cff" },
  { date: "09-18", label: "日本央行会议", type: "BOJ", color: "#ffd24a" },
];
