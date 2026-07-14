import { marketDataService } from "../services/marketDataService";

const satelliteSymbols = ["510300.SH", "510500.SH", "588000.SH"];

export function useSatelliteStocks() {
  return marketDataService.getStockQuotes().filter((stock) => satelliteSymbols.includes(stock.symbol));
}
