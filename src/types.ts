export type School = {
  id: string;
  fullName: string;
  address: string;
  postalCode: string;
  lat: number;
  lon: number;
  openDays: string[];      // ISO YYYY-MM-DD, sorted asc
  rawSchedule: string;
};
