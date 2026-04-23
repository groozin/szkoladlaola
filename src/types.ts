export type SchoolClass = {
  code: string;                      // "1A", "1AMK"
  profile: string | null;            // "biol-chem-mat" / "psychologiczna"
  extendedSubjects: string[];
  recruitmentSubjects: string[];
  languages: string[];
  thresholdMin: number | null;       // last published próg, if any
  thresholdYear: string | null;      // e.g. "2025/2026"
};

export type School = {
  id: string;
  fullName: string;
  address: string;
  postalCode: string;
  district: string | null;
  lat: number;
  lon: number;
  openDays: string[];                // ISO YYYY-MM-DD, sorted asc
  rawSchedule: string;
  isPublic: boolean;
  inPdf: boolean;                    // appeared in the open-days PDF
  website: string | null;
  otouczelnieUrl: string | null;
  rankMalopolska: number | null;      // Perspektywy 2025 Małopolska rank
  rankPoland: number | null;          // Perspektywy 2025 national rank
  classesYear: string | null;         // year the class profiles are for
  classes: SchoolClass[];
};

export type Landmark = {
  id: string;
  address: string;
  lat: number;
  lon: number;
};
