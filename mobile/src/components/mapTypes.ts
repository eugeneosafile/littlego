export interface LatLon { lat: number; lon: number }
export interface MapPoint { vehicle: LatLon | null; school: LatLon; home: LatLon | null; label: string }
