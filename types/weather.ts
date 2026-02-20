export interface PWSStation {
  stationID: string;
  lat: number;
  lon: number;
  neighborhood: string;
  tempF: number;
  humidity: number;
  windspeedmph: number;
  lastUpdateTime: string; // ISO string
  isOutlier: boolean; // added by our filtering layer
}

export interface StationsResponse {
  stations: PWSStation[];
  fetchedAt: string;
}
