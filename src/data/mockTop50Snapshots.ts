import { topVolumeService } from "../services/topVolumeService";

export const mockTop50Snapshots = {
  previous: topVolumeService.getPreviousTop50(),
  current: topVolumeService.getCurrentTop50(),
};
