export const COLOURS = {
    blue: "#002452",
    brightBlue: "#034496",
    yellow: "#fabd0f",
    red: "#b90e31",
    orange: "#f08c00",
    white: "#ffffff",
    grey: "#d1d3d4",
    darkGrey: "#808285",
    black: "#000000"
} as const;
  
export type ColourKey = keyof typeof COLOURS;