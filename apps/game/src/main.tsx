import "./styles.css";
import "./app/react-shell.css";
import { mountReactApp } from "./app/mount";
import { createReactAppServices } from "./app/react-services";
import { activateTelegramViewportMock, resolveTelegramMockId, telegramViewportPresets } from "./telegram/mock";

const rootElement = document.querySelector<HTMLElement>("#react-root");
if (!rootElement) throw new Error("The React app root is missing.");

const telegramMock = resolveTelegramMockId(new URLSearchParams(window.location.search).get("telegramMock"));
if (telegramMock) activateTelegramViewportMock(telegramViewportPresets[telegramMock]);

const services = createReactAppServices();
if (import.meta.env.DEV) {
  (window as Window & {
    __FISHING_REACT__?: { emitFishingComplete: typeof services.runtime.emitCompleteForTest; emitFishingAmbient: typeof services.runtime.emitAmbientForTest };
  }).__FISHING_REACT__ = {
    emitFishingComplete: (event) => services.runtime.emitCompleteForTest(event),
    emitFishingAmbient: (encounterId) => services.runtime.emitAmbientForTest(encounterId),
  };
}
mountReactApp(rootElement, services);
