export interface CatchRecord {
  id: string;
  userId: string;
  species: string;
  length: number;
  location: {
    latitude: number;
    longitude: number;
    name: string;
  };
  capturedAt: string;
  image?: string;
  status: 'pass' | 'violation' | 'unknown';
}

export type SortOption = 'date' | 'length' | 'species';
