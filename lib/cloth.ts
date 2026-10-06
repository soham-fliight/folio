export type Cloth = {
  id: string;
  cover: string;
  spine: string;
  foil: string;
  endpaper: string;
};

const CLOTHS: Cloth[] = [
  { id: "burgundy", cover: "#6e2c34", spine: "#4e1e25", foil: "#f0ddb0", endpaper: "#3a2224" },
  { id: "forest", cover: "#1e3b34", spine: "#132822", foil: "#e7d7b0", endpaper: "#172e28" },
  { id: "navy", cover: "#24344f", spine: "#182436", foil: "#e6d5ae", endpaper: "#1b2738" },
  { id: "ochre", cover: "#7a4b24", spine: "#5a3518", foil: "#f6e7c8", endpaper: "#3a2918" },
  { id: "plum", cover: "#4a2c45", spine: "#321c2e", foil: "#f0e0c4", endpaper: "#2a1c28" },
  { id: "ink", cover: "#2c2825", spine: "#1a1816", foil: "#e4c98a", endpaper: "#24211e" },
];

export function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

export function clothFor(title: string): Cloth {
  return CLOTHS[hashString(title) % CLOTHS.length];
}

export function coverHeight(title: string): number {
  return 208 + (hashString(title) % 48);
}

export function pageBlockWidth(pageCount: number): number {
  return Math.min(26, Math.max(8, Math.round(7 + pageCount / 35)));
}
