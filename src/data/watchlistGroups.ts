import type { WatchlistGroup } from "../types/themeGroup";

export const watchlistGroups: WatchlistGroup[] = [
  {
    id: "ai-semiconductors",
    name: "人工智能与算力",
    description: "国产算力、服务器、光模块与半导体",
    icon: "Cpu",
    symbols: ["300308.SZ", "002230.SZ", "688041.SH", "603019.SH"],
  },
  {
    id: "cloud-ai-software",
    name: "软件与数字经济",
    description: "云计算、工业软件、金融科技与数字服务",
    icon: "Cloud",
    symbols: ["600570.SH", "300033.SZ", "002410.SZ"],
  },
  {
    id: "internet-attention",
    name: "消费与传媒",
    description: "白酒、家电、传媒与消费服务",
    icon: "Globe",
    symbols: ["600519.SH", "000858.SZ", "000651.SZ"],
  },
  {
    id: "space-mobility",
    name: "新能源车与智能制造",
    description: "动力电池、整车、光伏与高端制造",
    icon: "Rocket",
    symbols: ["300750.SZ", "002594.SZ", "601012.SH"],
  },
  {
    id: "crypto-onchain",
    name: "金融与高股息",
    description: "银行、保险、券商与央企红利",
    icon: "Bitcoin",
    symbols: ["601318.SH", "600036.SH", "601398.SH"],
  },
  {
    id: "clean-energy-resources",
    name: "资源与公用事业",
    description: "有色金属、电力与能源运营",
    icon: "Leaf",
    symbols: ["601899.SH", "600900.SH"],
  },
  {
    id: "healthcare-pharma",
    name: "医药与医疗器械",
    description: "创新药、医疗服务与医疗器械",
    icon: "Pill",
    symbols: ["300760.SZ", "600276.SH"],
  },
  {
    id: "consumer-defensive",
    name: "国防军工",
    description: "航空装备、船舶与军工电子",
    icon: "ShoppingCart",
    symbols: ["600893.SH", "601989.SH"],
  },
  {
    id: "market-satellites",
    name: "宽基 ETF 观察",
    description: "仅用于监控组和太阳系侧栏，不参与主题排名与主榜",
    icon: "Satellite",
    symbols: ["510300.SH", "510500.SH", "588000.SH"],
    satelliteOnly: true,
  },
];
