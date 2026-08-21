import { describe, expect, it } from "vitest";
import { bytesToHex, hmacSha256 } from "./crypto";
import { validateTelegramInitData } from "./telegram";

const botToken = "123456:test-token";
const nowSeconds = 1_700_000_000;

async function signedInitData(authDate = nowSeconds): Promise<string> {
  const fields = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAH-test-query",
    user: JSON.stringify({ id: 987654321, first_name: "Ada", username: "ada" }),
  });
  const dataCheckString = [...fields.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = await hmacSha256("WebAppData", botToken);
  const hash = bytesToHex(await hmacSha256(secretKey, dataCheckString));
  fields.set("hash", hash);
  return fields.toString();
}

describe("validateTelegramInitData", () => {
  it("accepts a correctly signed payload and normalizes the Telegram identity", async () => {
    const result = await validateTelegramInitData(await signedInitData(), botToken, { nowSeconds });

    expect(result.user).toMatchObject({ id: "987654321", username: "ada", first_name: "Ada" });
    expect(result.authDate).toBe(nowSeconds);
  });

  it("rejects a tampered payload", async () => {
    const initData = (await signedInitData()).replace("ada", "eve");

    await expect(validateTelegramInitData(initData, botToken, { nowSeconds })).rejects.toThrow("signature is invalid");
  });

  it("rejects expired payloads", async () => {
    const initData = await signedInitData(nowSeconds - 100);

    await expect(validateTelegramInitData(initData, botToken, { nowSeconds, maxAgeSeconds: 60 })).rejects.toThrow("expired");
  });
});
