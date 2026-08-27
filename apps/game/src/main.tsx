import "./styles.css";
import "./app/react-shell.css";
import { mountReactApp } from "./app/mount";
import { createReactAppServices } from "./app/react-services";
import { activateTelegramViewportMock, resolveTelegramMockId, telegramViewportPresets } from "./telegram/mock";

const rootElement = document.querySelector<HTMLElement>("#react-root");
if (!rootElement) throw new Error("The React migration shell is missing its root element.");

const telegramMock = resolveTelegramMockId(new URLSearchParams(window.location.search).get("telegramMock"));
if (telegramMock) activateTelegramViewportMock(telegramViewportPresets[telegramMock]);

mountReactApp(rootElement, createReactAppServices());
