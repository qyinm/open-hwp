import type { OpenHwpDesktopApi } from "./engine";

declare global {
  interface Window {
    openhwp?: OpenHwpDesktopApi;
  }
}

export {};
