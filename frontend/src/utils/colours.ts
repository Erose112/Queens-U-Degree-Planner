export const COLOURS = {
    blue: "#002452",
    brightBlue: "#034496",
    yellow: "#fabd0f",
    red: "#b90e31",
    orange: "#f08c00",
    white: "#fafaf9",
    warmWhite: "#F2EFE9",
    grey: "#d1d3d4",
    darkGrey: "#808285",
    black: "#000000",
    green: "#2e7d32",
} as const;
  
export type ColourKey = keyof typeof COLOURS;