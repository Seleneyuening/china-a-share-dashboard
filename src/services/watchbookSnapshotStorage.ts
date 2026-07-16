export type WatchbookSnapshotRow = {
  groupId: string;
  tier: string;
  averageChangePct: number;
};

export type WatchbookDailySnapshot = {
  date: string;
  updatedAt: string;
  rows: WatchbookSnapshotRow[];
};

const storageKey = "china-a-share-watchbook-snapshots-v1";

function readAll(): WatchbookDailySnapshot[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const watchbookSnapshotStorage = {
  save(snapshot: WatchbookDailySnapshot) {
    const next = [...readAll().filter((item) => item.date !== snapshot.date), snapshot]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  },
  getGroupHistory(groupId: string, limit = 5) {
    return readAll()
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .flatMap((snapshot) => {
        const row = snapshot.rows.find((item) => item.groupId === groupId);
        return row ? [{ date: snapshot.date, ...row }] : [];
      })
      .slice(0, limit);
  },
};
