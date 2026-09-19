import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { polyRef } from "./poly.js";
export { polyRef };
export const cn = (...inputs) => twMerge(clsx(inputs));
